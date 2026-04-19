import { describe, it, expect } from 'vitest'
import { rankFilesByFailureLocality } from '../src/fix-file-ranker.js'
import type { FailureSignals } from '../src/fix-file-ranker.js'

// Phase 04 (DX-08): locality-aware ranker for the Copilot fix-loop.
// Pure function — contracts:
//   1. Exact `file` match on a unit failure scores highest (10).
//   2. Directory overlap between `file` and source path scores mid (5).
//   3. Basename-in-testName / flowName / error scores lowest positive (3).
//   4. Passed ui results are ignored.
//   5. Empty / absent signals => input order preserved (stable fallback).
//   6. Tie-break: input order (stable sort).

describe('rankFilesByFailureLocality', () => {
  it('ranks exact file match first (Happy path 1)', () => {
    const sourceFiles = ['/p/src/Login.tsx', '/p/src/Home.tsx', '/p/src/Other.tsx']
    const failures: FailureSignals = {
      unit: {
        failures: [{ testName: 'login shows', file: '/p/src/Login.tsx' }],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked[0]).toBe('/p/src/Login.tsx')
  })

  it('ranks basename-in-testName hit above unrelated (Happy path 2)', () => {
    const sourceFiles = ['/p/src/A.tsx', '/p/src/Login.tsx']
    const failures: FailureSignals = {
      unit: {
        failures: [{ testName: 'Login test fails' }],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked[0]).toBe('/p/src/Login.tsx')
  })

  it('orders exact match > directory overlap > unrelated (Happy path 3)', () => {
    const sourceFiles = ['/p/src/auth/Login.tsx', '/p/src/auth/Register.tsx', '/p/src/Home.tsx']
    const failures: FailureSignals = {
      unit: {
        failures: [{ file: '/p/src/auth/Login.tsx', testName: 't' }],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked).toEqual(['/p/src/auth/Login.tsx', '/p/src/auth/Register.tsx', '/p/src/Home.tsx'])
  })

  it('returns input order when ui.results and unit.failures are empty (Fallback 1)', () => {
    const sourceFiles = ['/a.ts', '/b.ts', '/c.ts']
    const failures: FailureSignals = { ui: { results: [] }, unit: { failures: [] } }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked).toEqual(['/a.ts', '/b.ts', '/c.ts'])
  })

  it('returns input order when failures is an empty object (Fallback 2)', () => {
    const sourceFiles = ['/a.ts']
    const failures: FailureSignals = {}

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked).toEqual(['/a.ts'])
  })

  it('preserves input order for equal scores (stable tie-break)', () => {
    const sourceFiles = ['/src/A.ts', '/src/B.ts']
    const failures: FailureSignals = {
      ui: {
        results: [{ flowName: 'A and B test', error: 'fail', passed: false }],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked).toEqual(['/src/A.ts', '/src/B.ts'])
  })

  it('uses ui.results[].error as a locality signal', () => {
    const sourceFiles = ['/src/Login.tsx', '/src/Home.tsx']
    const failures: FailureSignals = {
      ui: {
        results: [{ flowName: 'auth', error: 'element Login not found', passed: false }],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked[0]).toBe('/src/Login.tsx')
  })

  it('ignores passed ui results and only scores failing ones', () => {
    const sourceFiles = ['/src/A.tsx', '/src/B.tsx']
    const failures: FailureSignals = {
      ui: {
        results: [
          { flowName: 'A test', error: '', passed: true },
          { flowName: 'B test', error: '', passed: false },
        ],
      },
    }

    const ranked = rankFilesByFailureLocality(sourceFiles, failures)

    expect(ranked).toEqual(['/src/B.tsx', '/src/A.tsx'])
  })

  it('completes 1000 files × 100 failures under 500ms (perf sanity)', () => {
    const sourceFiles: string[] = []
    for (let i = 0; i < 1000; i++) {
      sourceFiles.push(`/p/src/feature${i % 10}/File${i}.tsx`)
    }

    const unitFailures: Array<{ testName?: string; file?: string }> = []
    for (let i = 0; i < 100; i++) {
      unitFailures.push({
        testName: `File${i * 3} should work`,
        file: i % 2 === 0 ? `/p/src/feature${i % 10}/File${i}.tsx` : undefined,
      })
    }

    const failures: FailureSignals = { unit: { failures: unitFailures } }

    const start = performance.now()
    const ranked = rankFilesByFailureLocality(sourceFiles, failures)
    const elapsed = performance.now() - start

    expect(ranked.length).toBe(1000)
    // Threshold loosened from 100ms to 500ms to accommodate free-tier CI
    // runners (GitHub hosted ubuntu-latest is ~3-5x slower than local dev).
    // Local runs typically finish in <20ms. The test still catches O(n²) or
    // worse regressions while being robust to CI noise.
    expect(elapsed).toBeLessThan(500)
  })
})
