import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalRunner } from '../src/local-runner.js'

describe('LocalRunner', () => {
  let workDir: string
  let runner: LocalRunner

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dtc-runner-'))
    runner = new LocalRunner(workDir)
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  describe('exec', () => {
    it('runs a command and returns stdout, stderr, exitCode', async () => {
      const result = await runner.exec('echo', ['hello world'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe('hello world')
      expect(result.stderr).toBe('')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('returns non-zero exit code on failure', async () => {
      const result = await runner.exec('sh', ['-c', 'exit 42'])

      expect(result.exitCode).toBe(42)
    })

    it('captures stderr', async () => {
      const result = await runner.exec('sh', ['-c', 'echo error >&2'])

      expect(result.stderr.trim()).toBe('error')
    })

    it('handles missing command gracefully (ENOENT)', async () => {
      const result = await runner.exec('nonexistent-command-xyz', [])

      expect(result.exitCode).toBe(127)
      expect(result.stderr).toContain('not found')
    })

    it('respects cwd option', async () => {
      const result = await runner.exec('pwd', [], { cwd: '/tmp' })

      // /tmp may resolve to /private/tmp on macOS
      expect(result.stdout.trim()).toMatch(/\/tmp$/)
    })

    it('respects env option', async () => {
      const result = await runner.exec('sh', ['-c', 'echo $DTC_TEST_VAR'], {
        env: { DTC_TEST_VAR: 'test-value' },
      })

      expect(result.stdout.trim()).toBe('test-value')
    })

    it('times out long-running commands', async () => {
      const result = await runner.exec('sleep', ['10'], { timeout: 100 })

      expect(result.exitCode).not.toBe(0)
    })
  })

  describe('file operations', () => {
    it('writeFile + readFile round-trips content', async () => {
      const filePath = join(workDir, 'test.txt')

      await runner.writeFile(filePath, 'hello dtc')
      const content = await runner.readFile(filePath)

      expect(content).toBe('hello dtc')
    })

    it('writeFile creates intermediate directories', async () => {
      const filePath = join(workDir, 'a', 'b', 'c', 'deep.txt')

      await runner.writeFile(filePath, 'deep content')
      const content = await runner.readFile(filePath)

      expect(content).toBe('deep content')
    })

    it('exists returns true for existing files', async () => {
      const filePath = join(workDir, 'exists.txt')
      await runner.writeFile(filePath, 'yes')

      expect(await runner.exists(filePath)).toBe(true)
    })

    it('exists returns false for missing files', async () => {
      expect(await runner.exists(join(workDir, 'nope.txt'))).toBe(false)
    })

    it('glob finds matching files', async () => {
      await runner.writeFile(join(workDir, 'a.ts'), '')
      await runner.writeFile(join(workDir, 'b.ts'), '')
      await runner.writeFile(join(workDir, 'c.js'), '')

      const matches = await runner.glob(join(workDir, '*.ts'))

      expect(matches).toHaveLength(2)
      expect(matches.map((m) => m.split('/').pop())).toEqual(
        expect.arrayContaining(['a.ts', 'b.ts']),
      )
    })
  })

  describe('capabilities', () => {
    it('reports host platform', () => {
      expect(runner.capabilities.platform).toBe(process.platform)
    })

    it('detects node is available', () => {
      expect(runner.capabilities.hasNode).toBe(true)
    })
  })
})
