import { describe, it, expect, vi } from 'vitest'
import { extractFileKey, FigmaRestClient } from '../src/figma-rest-client.js'

describe('extractFileKey', () => {
  it('extracts key from /design/ URL', () => {
    expect(extractFileKey('https://www.figma.com/design/ABC123xyz/MyDesign')).toBe('ABC123xyz')
  })

  it('extracts key from /file/ URL', () => {
    expect(extractFileKey('https://www.figma.com/file/XYZ789/OtherDesign')).toBe('XYZ789')
  })

  it('throws for invalid URL', () => {
    expect(() => extractFileKey('https://example.com/foo')).toThrow('Cannot extract file key')
  })
})

describe('FigmaRestClient', () => {
  function mockFetch(
    responses: Array<{ ok: boolean; json?: unknown; text?: string; arrayBuffer?: ArrayBuffer }>,
  ) {
    let callIndex = 0
    return vi.fn().mockImplementation(async () => {
      const resp = responses[callIndex++] ?? { ok: false, text: 'No more responses' }
      return {
        ok: resp.ok,
        json: async () => resp.json,
        text: async () => resp.text ?? '',
        arrayBuffer: async () => resp.arrayBuffer ?? new ArrayBuffer(0),
      }
    })
  }

  const sampleFileResponse = {
    name: 'TestDesign',
    lastModified: '2026-04-09',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:0',
          name: 'Page 1',
          type: 'CANVAS',
          children: [
            {
              id: '2:0',
              name: 'Home',
              type: 'FRAME',
              children: [{ id: '3:0', name: 'Title', type: 'TEXT', characters: 'Hello World' }],
            },
          ],
        },
      ],
    },
  }

  describe('getDesignContext', () => {
    it('calls Figma API and returns design context', async () => {
      const fetchImpl = mockFetch([{ ok: true, json: sampleFileResponse }])
      const client = new FigmaRestClient({ token: 'test-token', fetchImpl })

      const result = await client.getDesignContext({
        fileUrl: 'https://www.figma.com/design/ABC123/Test',
      })

      expect(result.screenNames).toEqual(['Home'])
      expect(result.code).toContain('Hello World')
      expect(result.metadata.fileName).toBe('TestDesign')
      expect(fetchImpl).toHaveBeenCalledWith('https://api.figma.com/v1/files/ABC123', {
        headers: { 'X-Figma-Token': 'test-token' },
      })
    })

    it('throws on API error', async () => {
      const fetchImpl = mockFetch([{ ok: false, text: 'Forbidden' }])
      const client = new FigmaRestClient({ token: 'bad-token', fetchImpl })

      await expect(
        client.getDesignContext({
          fileUrl: 'https://www.figma.com/design/ABC123/Test',
        }),
      ).rejects.toThrow('Figma API error')
    })
  })

  describe('getScreenshot', () => {
    it('fetches file then renders image', async () => {
      const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
      const fetchImpl = mockFetch([
        // 1st call: get file to find first frame
        { ok: true, json: sampleFileResponse },
        // 2nd call: render image
        { ok: true, json: { images: { '2:0': 'https://figma-cdn.com/rendered.png' } } },
        // 3rd call: download PNG
        { ok: true, arrayBuffer: pngData },
      ])
      const client = new FigmaRestClient({ token: 'test-token', fetchImpl })

      const result = await client.getScreenshot({
        fileUrl: 'https://www.figma.com/design/ABC123/Test',
      })

      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBe(4)
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    })
  })
})
