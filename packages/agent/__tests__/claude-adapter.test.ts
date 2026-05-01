import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const { ClaudeCodeAgent } = await import('../src/adapters/claude.js')

function makeSuccessfulStreamChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    write: () => true,
    end: () => {
      setImmediate(() => {
        child.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'assistant',
              message: { content: [{ type: 'text', text: 'done' }] },
            }) + '\n',
          ),
        )
        child.emit('close', 0)
      })
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  return child
}

describe('ClaudeCodeAgent', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('keeps Claude Code stream-json command shape', async () => {
    vi.mocked(spawn).mockReturnValueOnce(makeSuccessfulStreamChild() as any)

    const agent = new ClaudeCodeAgent()
    const result = await agent.run({
      prompt: 'Generate an app',
      cwd: '/tmp/generated-app',
      model: 'claude-sonnet-4-6',
      maxBudgetUsd: 10,
    })

    expect(result.success).toBe(true)
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining([
        '--print',
        '--verbose',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--model',
        'claude-sonnet-4-6',
        '--max-budget-usd',
        '10',
      ]),
      expect.objectContaining({ cwd: '/tmp/generated-app' }),
    )
  })
})
