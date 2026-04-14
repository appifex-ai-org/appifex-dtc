import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PencilAdapter } from '../src/pencil-adapter.js'
import type { Runner, ExecResult } from '@appifex/core'

function mockRunner(execResult: Partial<ExecResult> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: 100,
      ...execResult,
    }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: false, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'darwin' },
  }
}

describe('PencilAdapter', () => {
  describe('create', () => {
    it('calls pencil CLI with prompt and output path', async () => {
      const runner = mockRunner()
      const adapter = new PencilAdapter(runner, { cliKey: 'pk-test' })

      const result = await adapter.create({
        prompt: 'Pet adoption app with browse and favorites',
        outputPath: '/tmp/design.pen',
      })

      expect(runner.exec).toHaveBeenCalledWith(
        'pencil',
        expect.arrayContaining([
          '--prompt', 'Pet adoption app with browse and favorites',
          '--out', '/tmp/design.pen',
        ]),
        expect.objectContaining({ env: expect.objectContaining({ PENCIL_CLI_KEY: 'pk-test' }) }),
      )
      expect(result.penPath).toBe('/tmp/design.pen')
      expect(result.success).toBe(true)
    })

    it('exports preview image when exportPath is provided', async () => {
      const runner = mockRunner()
      const adapter = new PencilAdapter(runner, { cliKey: 'pk-test' })

      await adapter.create({
        prompt: 'App',
        outputPath: '/tmp/design.pen',
        exportPath: '/tmp/preview.png',
      })

      expect(runner.exec).toHaveBeenCalledWith(
        'pencil',
        expect.arrayContaining(['--export', '/tmp/preview.png']),
        expect.anything(),
      )
    })

    it('returns failure when CLI exits non-zero', async () => {
      const runner = mockRunner({ exitCode: 1, stderr: 'auth failed' })
      const adapter = new PencilAdapter(runner, { cliKey: 'bad-key' })

      const result = await adapter.create({ prompt: 'App', outputPath: '/tmp/d.pen' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('auth failed')
    })
  })

  describe('iterate', () => {
    it('calls pencil CLI with existing .pen file and iteration prompt', async () => {
      const runner = mockRunner()
      const adapter = new PencilAdapter(runner, { cliKey: 'pk-test' })

      const result = await adapter.iterate({
        inputPath: '/tmp/design.pen',
        outputPath: '/tmp/design.pen',
        prompt: 'Make cards 2-column grid with shadows',
      })

      expect(runner.exec).toHaveBeenCalledWith(
        'pencil',
        expect.arrayContaining([
          '--in', '/tmp/design.pen',
          '--out', '/tmp/design.pen',
          '--prompt', 'Make cards 2-column grid with shadows',
        ]),
        expect.anything(),
      )
      expect(result.success).toBe(true)
    })
  })
})
