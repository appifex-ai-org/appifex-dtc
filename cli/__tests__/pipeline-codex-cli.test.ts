import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { writeFile } from 'node:fs/promises'
import type { Writable } from 'node:stream'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const { spawn } = await import('node:child_process')
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
      void writeFile(outputPath, text, 'utf-8').then(() => {
        child.stdout.emit('data', Buffer.from(`received ${Buffer.concat(chunks).length} bytes`))
        child.emit('close', 0)
      })
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

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
})
