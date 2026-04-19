import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pollForToken } from '../src/providers/copilot.js'

// Phase 03 (DX-05): deterministic tests for device-flow back-off.
//
// The pollForToken loop has two non-determinism sources in production:
//   - Math.random (for ±15% jitter)
//   - setTimeout (for the sleep itself)
// Both are injectable via PollForTokenOpts. Tests use a seeded mulberry32
// RNG and a tracking fake sleep so every assertion is reproducible.

// Seeded RNG — mulberry32. Returns a number in [0,1).
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fakeJsonResponse(body: Record<string, unknown>): Response {
  return { json: async () => body } as unknown as Response
}

describe('pollForToken (Phase 03 DX-05 back-off)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bumps interval by +5s after a slow_down response', async () => {
    // Three slow_down responses, then success. Starting interval = 5s.
    // Expected pre-each-fetch sleeps (before jitter):
    //   1st:  5s  (pre-slow_down #1)
    //   2nd: 10s  (after slow_down #1 → 5+5)
    //   3rd: 15s  (after slow_down #2 → 10+5)
    //   4th: 20s  (after slow_down #3 → 15+5)
    fetchSpy
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(fakeJsonResponse({ access_token: 'gho_xxx' }))

    const sleepCalls: number[] = []
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const token = await pollForToken('Iv1.test', 'DEV123', 5, {
      rng: seededRng(1),
      sleep: fakeSleep,
    })

    expect(token).toBe('gho_xxx')
    expect(sleepCalls).toHaveLength(4)

    // Each actual sleep should be within ±15% of its base (in seconds).
    const expectedBasesSec = [5, 10, 15, 20]
    for (let i = 0; i < 4; i++) {
      const baseMs = expectedBasesSec[i] * 1000
      const lower = Math.floor(baseMs * 0.85)
      const upper = Math.ceil(baseMs * 1.15)
      expect(sleepCalls[i]).toBeGreaterThanOrEqual(lower)
      expect(sleepCalls[i]).toBeLessThanOrEqual(upper)
    }
  })

  it('keeps interval stable on authorization_pending', async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(fakeJsonResponse({ access_token: 'gho_ok' }))

    const sleepCalls: number[] = []
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const token = await pollForToken('Iv1.test', 'DEV123', 5, {
      rng: seededRng(42),
      sleep: fakeSleep,
    })

    expect(token).toBe('gho_ok')
    expect(sleepCalls).toHaveLength(4)

    // All four sleeps should be within ±15% of the original 5s interval.
    for (const ms of sleepCalls) {
      expect(ms).toBeGreaterThanOrEqual(Math.floor(5000 * 0.85))
      expect(ms).toBeLessThanOrEqual(Math.ceil(5000 * 1.15))
    }
  })

  it('uses server-provided interval if it is larger than (current+5)', async () => {
    // Server responds slow_down with interval=30. Current is 5 → 5+5=10.
    // max(10, 30) = 30 → the next sleep should be around 30s (±15%).
    fetchSpy
      .mockResolvedValueOnce(fakeJsonResponse({ error: 'slow_down', interval: 30 }))
      .mockResolvedValueOnce(fakeJsonResponse({ access_token: 'ok' }))

    const sleepCalls: number[] = []
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const token = await pollForToken('Iv1.test', 'DEV123', 5, {
      rng: seededRng(7),
      sleep: fakeSleep,
    })

    expect(token).toBe('ok')
    expect(sleepCalls).toHaveLength(2)
    // First sleep at 5s baseline, ±15%.
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(Math.floor(5000 * 0.85))
    expect(sleepCalls[0]).toBeLessThanOrEqual(Math.ceil(5000 * 1.15))
    // Second sleep at 30s baseline (server-provided), ±15%.
    expect(sleepCalls[1]).toBeGreaterThanOrEqual(Math.floor(30_000 * 0.85))
    expect(sleepCalls[1]).toBeLessThanOrEqual(Math.ceil(30_000 * 1.15))
  })

  it('applies ±15% jitter so different seeds produce different sleeps', async () => {
    // Deviation from plan's Test 4 (see SUMMARY): plan specified
    // interval=5 with ">1s absolute jitter difference" — that's only
    // ±0.75s window per sample → unreliable. Use interval=10 so the
    // window is ±1.5s, leaving plenty of headroom. Also sample across
    // FOUR authorization_pending iterations (4 sleeps per seed) so the
    // cumulative difference between the two seed series clearly exceeds
    // 1 second.
    const buildRun = async (seed: number): Promise<number[]> => {
      const calls: number[] = []
      const fetchS = vi.spyOn(globalThis, 'fetch')
      fetchS
        .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
        .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
        .mockResolvedValueOnce(fakeJsonResponse({ error: 'authorization_pending' }))
        .mockResolvedValueOnce(fakeJsonResponse({ access_token: 'ok' }))
      await pollForToken('Iv1.test', 'DEV123', 10, {
        rng: seededRng(seed),
        sleep: async (ms: number) => {
          calls.push(ms)
        },
      })
      fetchS.mockRestore()
      return calls
    }

    const runA = await buildRun(1)
    const runB = await buildRun(999)

    // Not identical — jitter is applied.
    expect(runA).not.toEqual(runB)

    // Cumulative difference across the 4 sleeps is > 1000 ms.
    const totalDiff = runA.reduce((acc, ms, i) => acc + Math.abs(ms - runB[i]!), 0)
    expect(totalDiff).toBeGreaterThan(1000)
  })

  it('clamps effective sleep to at least 1 second even when base is tiny', async () => {
    // interval = 0.5 → base = 500ms. Even with minimum ±15% jitter
    // (0.85 = 425ms) the clamp to 1000ms must apply.
    fetchSpy.mockResolvedValueOnce(fakeJsonResponse({ access_token: 'ok' }))

    const sleepCalls: number[] = []
    await pollForToken('Iv1.test', 'DEV123', 0.5, {
      rng: seededRng(3),
      sleep: async (ms: number) => {
        sleepCalls.push(ms)
      },
    })

    expect(sleepCalls).toHaveLength(1)
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(1000)
  })

  it('throws on expired_token', async () => {
    fetchSpy.mockResolvedValueOnce(fakeJsonResponse({ error: 'expired_token' }))

    await expect(
      pollForToken('Iv1.test', 'DEV123', 5, {
        rng: seededRng(0),
        sleep: async () => {},
      }),
    ).rejects.toThrow('Device flow expired')
  })

  it('throws on access_denied', async () => {
    fetchSpy.mockResolvedValueOnce(fakeJsonResponse({ error: 'access_denied' }))

    await expect(
      pollForToken('Iv1.test', 'DEV123', 5, {
        rng: seededRng(0),
        sleep: async () => {},
      }),
    ).rejects.toThrow('User denied access')
  })

  it('backward-compat: accepts numeric 4th arg as timeoutMs', async () => {
    // Old signature: pollForToken(id, code, interval, timeoutMs=300000).
    // Must compile with no TS error AND behave the same as
    // { timeoutMs: N }. We pass a generous timeoutMs and expect success.
    fetchSpy.mockResolvedValueOnce(fakeJsonResponse({ access_token: 'legacy' }))

    // We can't pass rng/sleep in this legacy path, but a single
    // access_token response resolves before any real sleep matters —
    // the first sleep is still real setTimeout(ms). To keep the test
    // fast, pass interval=0 (still gets clamped to 1s by the helper
    // but that's fine — 1s is bounded and we only do one iteration).
    // Actually, just assert compile-time + resolve; do not assert timing.
    const token = await pollForToken('Iv1.test', 'DEV123', 0.01, 600_000)
    expect(token).toBe('legacy')
  }, 10_000)
})
