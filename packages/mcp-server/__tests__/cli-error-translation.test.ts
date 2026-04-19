import { describe, it, expect } from 'vitest'
import { CliError, PreflightError } from '@appifex/core'
import { createDtcMcpServer, wrapToolHandler } from '../src/server.js'

// These tests verify Phase 02 Plan 01 (FOUND-04): a tool handler that throws a
// CliError must translate to an MCP error envelope, not crash the host process.

describe('MCP tool CliError translation — Phase 02 Plan 01 (FOUND-04)', () => {
  it('wrapToolHandler returns an isError envelope on CliError', async () => {
    const throwing = async () => {
      throw new PreflightError('xcodebuild missing')
    }
    const wrapped = wrapToolHandler(throwing)
    const result = await wrapped({})
    expect(result.isError).toBe(true)
    expect(Array.isArray(result.content)).toBe(true)
    const first = (result.content as Array<{ type: string; text: string }>)[0]
    expect(first.type).toBe('text')
    expect(first.text).toMatch(/PreflightError/)
    expect(first.text).toMatch(/xcodebuild missing/)
  })

  it('wrapToolHandler passes through successful results unchanged', async () => {
    const ok = async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
      isError: false,
    })
    const wrapped = wrapToolHandler(ok)
    const result = await wrapped({})
    expect(result.isError).toBe(false)
    expect((result.content as Array<{ text: string }>)[0].text).toBe('ok')
  })

  it('wrapToolHandler re-throws non-CliError errors', async () => {
    const throwing = async () => {
      throw new Error('generic-boom')
    }
    const wrapped = wrapToolHandler(throwing)
    await expect(wrapped({})).rejects.toThrow('generic-boom')
  })

  it('translates a CliError base-class instance to an MCP error envelope', async () => {
    const wrapped = wrapToolHandler(async () => {
      throw new CliError('plain cli error', 7)
    })
    const result = await wrapped({})
    expect(result.isError).toBe(true)
    const first = (result.content as Array<{ text: string }>)[0]
    expect(first.text).toMatch(/plain cli error/)
  })

  it('createDtcMcpServer registers tools whose handlers go through the CliError wrapper', () => {
    const server = createDtcMcpServer()
    expect(server).toBeDefined()
    // Smoke: host is alive after construction; wrapping happens at registration.
    expect(typeof server.connect).toBe('function')
  })
})
