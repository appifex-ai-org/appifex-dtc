import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @googleapis/androidpublisher before importing the client
const mockInsert = vi.fn()
const mockUpload = vi.fn()
const mockUpdate = vi.fn()
const mockCommit = vi.fn()
const mockGetClient = vi.fn()

vi.mock('@googleapis/androidpublisher', () => {
  class MockAuthPlus {
    getClient = mockGetClient
  }
  return {
    androidpublisher: vi.fn(() => ({
      edits: {
        insert: mockInsert,
        bundles: { upload: mockUpload },
        tracks: { update: mockUpdate },
        commit: mockCommit,
      },
    })),
    AuthPlus: MockAuthPlus,
  }
})

// Mock node:fs to avoid real file system access
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => 'mock-stream'),
}))

import { PlayConsoleClient } from '../src/play-console-client.js'

describe('PlayConsoleClient', () => {
  const creds = { serviceAccountKeyPath: '/keys/service-account.json' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClient.mockResolvedValue({ credentials: {} })
    mockInsert.mockResolvedValue({ data: { id: 'edit-123' } })
    mockUpload.mockResolvedValue({ data: { versionCode: 42 } })
    mockUpdate.mockResolvedValue({ data: {} })
    mockCommit.mockResolvedValue({ data: {} })
  })

  describe('submitToTrack', () => {
    it('calls all 4 API methods in correct order', async () => {
      const client = new PlayConsoleClient(creds)

      const result = await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/app.aab',
      })

      expect(result.success).toBe(true)
      expect(result.versionCode).toBe(42)

      // Verify order: insert → upload → tracks.update → commit
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ packageName: 'com.example.app' }),
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'com.example.app',
          editId: 'edit-123',
        }),
      )
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'com.example.app',
          editId: 'edit-123',
          track: 'internal',
          requestBody: expect.objectContaining({
            track: 'internal',
            releases: [{ status: 'draft', versionCodes: ['42'] }],
          }),
        }),
      )
      expect(mockCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'com.example.app',
          editId: 'edit-123',
        }),
      )
    })

    it('defaults to internal track', async () => {
      const client = new PlayConsoleClient(creds)

      await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/app.aab',
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ track: 'internal' }),
      )
    })

    it('uses specified track', async () => {
      const client = new PlayConsoleClient(creds)

      await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/app.aab',
        track: 'beta',
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ track: 'beta' }),
      )
    })

    it('returns failure on API error', async () => {
      mockInsert.mockRejectedValue(new Error('Authentication failed'))
      const client = new PlayConsoleClient(creds)

      const result = await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/app.aab',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Authentication failed')
    })

    it('returns failure on upload error', async () => {
      mockUpload.mockRejectedValue(new Error('Invalid AAB'))
      const client = new PlayConsoleClient(creds)

      const result = await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/bad.aab',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid AAB')
    })

    it('includes output message on success', async () => {
      const client = new PlayConsoleClient(creds)

      const result = await client.submitToTrack({
        packageName: 'com.example.app',
        aabPath: '/build/app.aab',
        track: 'alpha',
      })

      expect(result.success).toBe(true)
      expect(result.output).toContain('alpha')
      expect(result.output).toContain('42')
    })
  })
})
