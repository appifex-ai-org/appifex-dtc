import { describe, it, expect, vi, beforeEach } from 'vitest'
import { E2BRunner } from '../src/e2b-runner.js'

// Mock at the HTTP boundary — E2BRunner talks to a sandbox API
const mockFetch = vi.fn()

describe('E2BRunner', () => {
  let runner: E2BRunner

  beforeEach(() => {
    mockFetch.mockReset()
    runner = new E2BRunner({
      sandboxId: 'sbx-123',
      apiKey: 'e2b-test-key',
      apiUrl: 'https://api.e2b.dev',
      fetchImpl: mockFetch,
    })
  })

  describe('exec', () => {
    it('sends command to sandbox exec endpoint and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          exitCode: 0,
          stdout: 'hello',
          stderr: '',
        }),
      })

      const result = await runner.exec('echo', ['hello'])

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.e2b.dev/sandboxes/sbx-123/exec')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({
        command: 'echo',
        args: ['hello'],
        cwd: undefined,
        env: undefined,
        timeout: undefined,
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello')
    })

    it('passes cwd and env options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      })

      await runner.exec('ls', [], { cwd: '/app', env: { FOO: 'bar' } })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.cwd).toBe('/app')
      expect(body.env).toEqual({ FOO: 'bar' })
    })
  })

  describe('readFile', () => {
    it('reads file from sandbox', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'file content',
      })

      const content = await runner.readFile('/app/index.ts')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.e2b.dev/sandboxes/sbx-123/files?path=%2Fapp%2Findex.ts')
    })
  })

  describe('writeFile', () => {
    it('writes file to sandbox', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await runner.writeFile('/app/test.ts', 'const x = 1')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.e2b.dev/sandboxes/sbx-123/files')
      expect(opts.method).toBe('PUT')
      const body = JSON.parse(opts.body)
      expect(body.path).toBe('/app/test.ts')
      expect(body.content).toBe('const x = 1')
    })
  })

  describe('exists', () => {
    it('returns true when file exists', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      expect(await runner.exists('/app/file.ts')).toBe(true)
    })

    it('returns false when file does not exist', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      expect(await runner.exists('/app/nope.ts')).toBe(false)
    })
  })

  describe('capabilities', () => {
    it('reports linux platform for E2B sandboxes', () => {
      expect(runner.capabilities.platform).toBe('linux')
      expect(runner.capabilities.hasNode).toBe(true)
    })
  })
})
