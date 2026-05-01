import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/util.js', () => ({
  which: vi.fn(),
}))

const { which } = await import('../src/util.js')
const { detectAgent } = await import('../src/registry.js')

function mockAvailable(binaries: string[]): void {
  const available = new Set(binaries)
  vi.mocked(which).mockImplementation(async (binary: string) => available.has(binary))
}

describe('detectAgent', () => {
  beforeEach(() => {
    vi.mocked(which).mockReset()
  })

  it('prefers Codex when requested by codex-cli provider', async () => {
    mockAvailable(['claude', 'codex'])

    const agent = await detectAgent({ preferred: 'codex' })

    expect(agent?.name).toBe('codex')
  })

  it('prefers Claude when requested by claude-cli provider', async () => {
    mockAvailable(['claude', 'codex'])

    const agent = await detectAgent({ preferred: 'claude' })

    expect(agent?.name).toBe('claude')
  })

  it('preserves legacy priority when no preferred agent is provided', async () => {
    mockAvailable(['claude', 'codex'])

    const agent = await detectAgent()

    expect(agent?.name).toBe('claude')
  })
})
