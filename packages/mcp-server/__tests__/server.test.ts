import { describe, it, expect } from 'vitest'
import { createDtcMcpServer } from '../src/server.js'

describe('createDtcMcpServer', () => {
  it('creates an MCP server instance', () => {
    const server = createDtcMcpServer()
    expect(server).toBeDefined()
    // McpServer has a connect method for transports
    expect(typeof server.connect).toBe('function')
  })
})
