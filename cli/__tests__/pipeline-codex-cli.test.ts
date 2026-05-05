import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import type { Writable } from 'node:stream'
import { CliError, EpipeError } from '@appifex/core'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const pipelineSource = readFileSync(new URL('../src/pipeline.ts', import.meta.url), 'utf-8')
const pipelineModule: {
  serializeMessagesForCli?: (messages: Array<{ role: string; content: unknown }>) => {
    prompt: string
    omittedImageCount: number
  }
  runCodexCli?: (opts: { prompt: string; model: string; cwd: string }) => Promise<{
    content: Array<{ type: string; text: string }>
    usage: { input_tokens: number; output_tokens: number }
  }>
} = await import('../src/pipeline.js')

function makeFakeCodexChildWritingLastMessage(text: string, args: string[]) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const outputPath = args[args.indexOf('--output-last-message') + 1]
  const stdinEmitter = new EventEmitter()
  const chunks: Buffer[] = []
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return true
    },
    end: () => {
      void writeFile(outputPath, text, 'utf-8')
        .then(() => {
          child.stdout.emit('data', Buffer.from(`received ${Buffer.concat(chunks).length} bytes`))
          child.emit('close', 0)
        })
        .catch((err: unknown) => child.emit('error', err))
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function makeFakeCodexChildClosingNonZero(code: number, stderr: string, stdout = '') {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: () => true,
    end: () => {
      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout))
      }
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr))
      }
      child.emit('close', code)
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function makeFakeCodexChildEmittingEpipeOnStdin() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  const stdinEmitter = new EventEmitter()
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: () => {
      setImmediate(() => {
        const err: NodeJS.ErrnoException = new Error('write EPIPE') as NodeJS.ErrnoException
        err.code = 'EPIPE'
        stdinEmitter.emit('error', err)
      })
      return true
    },
    end: () => {},
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('provider routing', () => {
  it('routes codex-cli LLM calls through Codex CLI with serialized text prompts', () => {
    expect(pipelineSource).toContain("cfg.llm.provider === 'codex-cli'")
    expect(pipelineSource).toContain('serializeMessagesForCli(params.messages)')
    expect(pipelineSource).toContain('return runCodexCli({ prompt, model, cwd: outputDir })')
  })

  it('uses provider image capability routing for text-only CLI providers', () => {
    expect(pipelineSource).toContain(
      "function providerSupportsImages(provider: DtcConfig['llm']['provider']): boolean",
    )
    expect(pipelineSource).toContain('providerSupportsImages(config.llm.provider)')
    expect(pipelineSource).not.toContain("config.llm.provider !== 'claude-cli'")
  })
})

describe('serializeMessagesForCli', () => {
  it('serializes text and omits image data for the text-only Codex CLI provider', () => {
    expect(typeof pipelineModule.serializeMessagesForCli).toBe('function')

    const result = pipelineModule.serializeMessagesForCli!([
      { role: 'system', content: 'plain system prompt' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first text part' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,should-not-appear',
            },
          },
          { type: 'text', text: 'second text part' },
          { type: 'image_url', image_url: { url: 'https://example.test/screen.png' } },
        ],
      },
      { role: 'assistant', content: 42 },
    ])

    expect(result.omittedImageCount).toBe(2)
    expect(result.prompt).toContain('## system\n\nplain system prompt')
    expect(result.prompt).toContain('## user\n\nfirst text part\nsecond text part')
    expect(result.prompt).toContain('## assistant\n\n42')
    expect(result.prompt).toContain(
      '[dtc note: omitted 2 image part(s); codex-cli provider is text-only in this release.]',
    )
    expect(result.prompt).not.toContain('should-not-appear')
    expect(result.prompt).not.toContain('base64')
    expect(result.prompt).not.toContain('https://example.test/screen.png')
  })
})

describe('runCodexCli', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('returns the final answer from --output-last-message', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      return makeFakeCodexChildWritingLastMessage('final answer from file\n', args)
    }) as any)

    const result = await pipelineModule.runCodexCli!({
      prompt: 'build the app',
      model: 'gpt-5.1-codex',
      cwd: '/tmp',
    })

    expect(result).toEqual({
      content: [{ type: 'text', text: 'final answer from file' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    expect(spawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = vi.mocked(spawn).mock.calls[0]
    expect(command).toBe('codex')
    expect(args).toEqual([
      'exec',
      '--model',
      'gpt-5.1-codex',
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '--skip-git-repo-check',
      '--color',
      'never',
      '--output-last-message',
      expect.stringContaining('last-message.txt'),
      '-',
    ])
    expect(options).toMatchObject({
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/tmp',
    })
  })

  it('rejects when codex exits non-zero', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    vi.mocked(spawn).mockReturnValue(
      makeFakeCodexChildClosingNonZero(2, 'invalid invocation') as any,
    )

    await expect(
      pipelineModule.runCodexCli!({
        prompt: 'build the app',
        model: 'gpt-5.1-codex',
        cwd: '/tmp',
      }),
    ).rejects.toThrow(/codex exec exited with code 2/)
  })

  it('rejects when codex writes an empty final response', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      return makeFakeCodexChildWritingLastMessage('\n  \t\n', args)
    }) as any)

    await expect(
      pipelineModule.runCodexCli!({
        prompt: 'build the app',
        model: 'gpt-5.1-codex',
        cwd: '/tmp',
      }),
    ).rejects.toThrow(/codex exec returned empty response/)
  })

  it('rejects with EpipeError when stdin emits EPIPE after child close', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    const child = makeFakeCodexChildEmittingEpipeOnStdin()
    vi.mocked(spawn).mockReturnValue(child as any)

    const promise = pipelineModule.runCodexCli!({
      prompt: 'x'.repeat(100_000),
      model: 'gpt-5.1-codex',
      cwd: '/tmp',
    })
    let settled = false
    let rejection: unknown = null
    const observed = promise.then(
      () => {
        settled = true
      },
      (err: unknown) => {
        settled = true
        rejection = err
      },
    )

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith('SIGTERM'))
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(settled).toBe(false)

    child.emit('close', 0)
    await observed

    expect(rejection).toBeInstanceOf(EpipeError)
    expect(rejection).toBeInstanceOf(CliError)
    expect(rejection).toMatchObject({
      name: 'EpipeError',
      site: 'cli/pipeline.ts:codex-cli',
      payloadBytes: 100_000,
    })
  })

  it('prefers nonzero close errors over pending stdin EPIPE', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    const child = makeFakeCodexChildEmittingEpipeOnStdin()
    vi.mocked(spawn).mockReturnValue(child as any)

    const promise = pipelineModule.runCodexCli!({
      prompt: 'x'.repeat(100_000),
      model: 'gpt-5.1-codex',
      cwd: '/tmp',
    })

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith('SIGTERM'))
    child.stderr.emit('data', Buffer.from('permission denied'))
    child.stdout.emit('data', Buffer.from('partial output that explains failure'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow(/codex exec exited with code 1/)
    await expect(promise).rejects.toThrow(/stderr: permission denied/)
    await expect(promise).rejects.toThrow(/stdout preview: partial output/)
    await expect(promise).rejects.not.toThrow(EpipeError)
  })

  it('preserves pending stdin EPIPE when the child closes from SIGTERM', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    const child = makeFakeCodexChildEmittingEpipeOnStdin()
    vi.mocked(spawn).mockReturnValue(child as any)

    const promise = pipelineModule.runCodexCli!({
      prompt: 'x'.repeat(100_000),
      model: 'gpt-5.1-codex',
      cwd: '/tmp',
    })

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith('SIGTERM'))
    child.emit('close', null, 'SIGTERM')

    await expect(promise).rejects.toThrow(EpipeError)
  })
})
