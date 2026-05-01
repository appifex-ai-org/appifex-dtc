import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const { CodexAgent } = await import('../src/adapters/codex.js')

function makeSuccessfulChild() {
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
          Buffer.from(JSON.stringify({ session_id: 'codex-session-1', message: 'done' }) + '\n'),
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

describe('CodexAgent', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('uses current codex exec flags for non-interactive codegen', async () => {
    vi.mocked(spawn).mockReturnValueOnce(makeSuccessfulChild() as any)

    const agent = new CodexAgent()
    const result = await agent.run({
      prompt: 'Generate an app',
      cwd: '/tmp/generated-app',
      model: 'gpt-5.5',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('done')
    expect(result.sessionId).toBe('codex-session-1')
    expect(spawn).toHaveBeenCalledWith(
      'codex',
      [
        'exec',
        '--full-auto',
        '--sandbox',
        'workspace-write',
        '--skip-git-repo-check',
        '--json',
        '--output-last-message',
        expect.any(String),
        '--model',
        'gpt-5.5',
        '-',
      ],
      expect.objectContaining({ cwd: '/tmp/generated-app' }),
    )
  })

  it('attaches design images when provided', async () => {
    vi.mocked(spawn).mockReturnValueOnce(makeSuccessfulChild() as any)

    const agent = new CodexAgent()
    await agent.run({
      prompt: 'Generate an app',
      cwd: '/tmp/generated-app',
      model: 'gpt-5.5',
      designImagePath: 'preview.png',
    })

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--image', 'preview.png']),
      expect.objectContaining({ cwd: '/tmp/generated-app' }),
    )
  })

  it('uses codex exec resume when a session id is provided', async () => {
    vi.mocked(spawn).mockReturnValueOnce(makeSuccessfulChild() as any)

    const agent = new CodexAgent()
    await agent.run({
      prompt: 'Continue',
      cwd: '/tmp/generated-app',
      model: 'default',
      resumeSessionId: 'codex-session-1',
    })

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      [
        'exec',
        'resume',
        '--full-auto',
        '--skip-git-repo-check',
        '--json',
        '--output-last-message',
        expect.any(String),
        'codex-session-1',
        '-',
      ],
      expect.objectContaining({ cwd: '/tmp/generated-app' }),
    )
  })
})
