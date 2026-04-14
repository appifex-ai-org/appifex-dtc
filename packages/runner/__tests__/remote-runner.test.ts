import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteRunner } from '../src/remote-runner.js'

const mockFetch = vi.fn()

describe('RemoteRunner', () => {
  let runner: RemoteRunner

  beforeEach(() => {
    mockFetch.mockReset()
    runner = new RemoteRunner({
      runnerUrl: 'https://mac-runner.local:8443',
      runnerToken: 'amr_test-token',
      fetchImpl: mockFetch,
    })
  })

  describe('exec', () => {
    it('sends command to runner exec endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      })

      const result = await runner.exec('xcodebuild', ['-version'])

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://mac-runner.local:8443/api/exec')
      expect(opts.headers['Authorization']).toBe('Bearer amr_test-token')
      expect(JSON.parse(opts.body)).toEqual({
        command: 'xcodebuild',
        args: ['-version'],
        cwd: undefined,
        env: undefined,
        timeout: undefined,
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('ok')
    })
  })

  describe('readFile', () => {
    it('reads file from remote runner', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'swift code here',
      })

      const content = await runner.readFile('/build/output/App.swift')
      expect(content).toBe('swift code here')
    })
  })

  describe('writeFile', () => {
    it('writes file to remote runner', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await runner.writeFile('/build/test.swift', 'import XCTest')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://mac-runner.local:8443/api/files')
      expect(opts.method).toBe('PUT')
    })
  })

  describe('capabilities', () => {
    it('reports darwin platform for Mac Runner', () => {
      expect(runner.capabilities.platform).toBe('darwin')
      expect(runner.capabilities.hasXcode).toBe(true)
    })
  })
})
