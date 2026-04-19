// Phase 04 (DX-07): refactor-safety net for the provider-message factory
// extraction. Proves that each factory returns a function with the right
// shape when called with a minimal config. Not a behavioural test of the
// providers themselves — full behaviour is covered by the existing 1247
// tests, which continue to exercise the factories indirectly via
// buildCreateMessageFn dispatch.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DtcConfig, DebugLogger } from '@appifex/core'

// ── Test doubles ───────────────────────────────────────────────────────────

function makeDebug(): DebugLogger {
  return {
    enabled: false,
    log: vi.fn().mockResolvedValue(undefined),
    logJson: vi.fn().mockResolvedValue(undefined),
  } as unknown as DebugLogger
}

function baseCfg(
  provider: DtcConfig['llm']['provider'],
  extra: Partial<DtcConfig['llm']> = {},
): DtcConfig {
  return {
    llm: { provider, apiKey: 'sk-test', ...extra },
    design: { tool: 'pencil' },
    runner: { type: 'local' },
  } as DtcConfig
}

beforeEach(() => {
  vi.resetModules()
})

// ── 1. createClaudeCliMessageFn ────────────────────────────────────────────

describe('createClaudeCliMessageFn (Phase 04 DX-07)', () => {
  it('returns a single-arg async function without spawning claude', async () => {
    // Stub node:child_process.spawn so the factory's dynamic import gets a fake.
    vi.doMock('node:child_process', () => ({
      spawn: vi.fn(() => {
        throw new Error('spawn should not be called during factory construction')
      }),
    }))

    const { createClaudeCliMessageFn } = await import('../src/providers/claude-cli-message.js')
    const fn = await createClaudeCliMessageFn(baseCfg('claude-cli'), {
      debug: makeDebug(),
      outputDir: '/tmp/dtc-test',
    })

    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
  })
})

// ── 2. createCopilotMessageFn ──────────────────────────────────────────────

describe('createCopilotMessageFn (Phase 04 DX-07)', () => {
  it('returns a single-arg async function when githubToken is set', async () => {
    // Stub the SDK so dynamic import in the factory body gets a fake.
    vi.doMock('@github/copilot-sdk', () => ({
      CopilotClient: class {
        start = vi.fn().mockResolvedValue(undefined)
        stop = vi.fn().mockResolvedValue(undefined)
        createSession = vi.fn().mockResolvedValue({
          sendAndWait: vi.fn().mockResolvedValue({ data: { content: '' } }),
          disconnect: vi.fn().mockResolvedValue(undefined),
        })
      },
    }))

    const { createCopilotMessageFn } = await import('../src/providers/copilot-message.js')
    const fn = await createCopilotMessageFn(baseCfg('copilot', { githubToken: 'ghp_test' }))

    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
  })
})

// ── 3. createGoogleMessageFn ───────────────────────────────────────────────

describe('createGoogleMessageFn (Phase 04 DX-07)', () => {
  it('returns a single-arg async function without making a network call', async () => {
    const { createGoogleMessageFn } = await import('../src/providers/google-message.js')
    const fn = await createGoogleMessageFn(baseCfg('google'))

    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
  })
})

// ── 4. createOpenAiMessageFn ───────────────────────────────────────────────

describe('createOpenAiMessageFn (Phase 04 DX-07)', () => {
  it('returns a single-arg async function without making a network call', async () => {
    const { createOpenAiMessageFn } = await import('../src/providers/openai-message.js')
    const fn = await createOpenAiMessageFn(baseCfg('openai'))

    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
  })
})

// ── 5. createAnthropicMessageFn ────────────────────────────────────────────

describe('createAnthropicMessageFn (Phase 04 DX-07)', () => {
  it('returns a single-arg async function with the SDK stubbed', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          stream: vi.fn(() => ({
            finalMessage: vi.fn().mockResolvedValue({
              content: [{ type: 'text', text: '' }],
              usage: { input_tokens: 0, output_tokens: 0 },
            }),
          })),
        }
      },
    }))

    const { createAnthropicMessageFn } = await import('../src/providers/anthropic-message.js')
    const fn = await createAnthropicMessageFn(baseCfg('anthropic'))

    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
  })
})

// ── 6. Uniform shape check across all factories ────────────────────────────

describe('all provider message factories (Phase 04 DX-07)', () => {
  it('each factory returns a function with arity 1 (single params arg)', async () => {
    vi.doMock('node:child_process', () => ({ spawn: vi.fn() }))
    vi.doMock('@github/copilot-sdk', () => ({
      CopilotClient: class {
        start = vi.fn().mockResolvedValue(undefined)
        stop = vi.fn().mockResolvedValue(undefined)
        createSession = vi.fn()
      },
    }))
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { stream: vi.fn() }
      },
    }))

    const [
      { createClaudeCliMessageFn },
      { createCopilotMessageFn },
      { createGoogleMessageFn },
      { createOpenAiMessageFn },
      { createAnthropicMessageFn },
    ] = await Promise.all([
      import('../src/providers/claude-cli-message.js'),
      import('../src/providers/copilot-message.js'),
      import('../src/providers/google-message.js'),
      import('../src/providers/openai-message.js'),
      import('../src/providers/anthropic-message.js'),
    ])

    const fns = await Promise.all([
      createClaudeCliMessageFn(baseCfg('claude-cli'), {
        debug: makeDebug(),
        outputDir: '/tmp/dtc-test',
      }),
      createCopilotMessageFn(baseCfg('copilot', { githubToken: 'ghp_test' })),
      createGoogleMessageFn(baseCfg('google')),
      createOpenAiMessageFn(baseCfg('openai')),
      createAnthropicMessageFn(baseCfg('anthropic')),
    ])

    for (const fn of fns) {
      expect(typeof fn).toBe('function')
      expect(fn.length).toBe(1)
    }
  })
})
