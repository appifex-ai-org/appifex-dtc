import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PencilMcpClient } from '../src/pencil-mcp-client.js'

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const mockCallTool = vi.fn()
  const mockConnect = vi.fn()
  const mockClose = vi.fn()
  class MockClient {
    connect = mockConnect
    close = mockClose
    callTool = mockCallTool
    constructor(_opts: unknown) {}
  }
  return {
    Client: MockClient,
    __mockCallTool: mockCallTool,
    __mockConnect: mockConnect,
    __mockClose: mockClose,
  }
})

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  class MockStdioClientTransport {
    _opts: unknown
    constructor(opts: unknown) { this._opts = opts }
  }
  return { StdioClientTransport: MockStdioClientTransport }
})

async function getMocks() {
  const mod = await import('@modelcontextprotocol/sdk/client/index.js') as Record<string, unknown>
  return {
    callTool: mod.__mockCallTool as ReturnType<typeof vi.fn>,
    connect: mod.__mockConnect as ReturnType<typeof vi.fn>,
    close: mod.__mockClose as ReturnType<typeof vi.fn>,
  }
}

describe('PencilMcpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when calling methods before connect', async () => {
    const client = new PencilMcpClient()
    await expect(client.batchGet({ filePath: 'design.pen' })).rejects.toThrow('not connected')
  })

  it('connects and disconnects', async () => {
    const mocks = await getMocks()
    const client = new PencilMcpClient({ cliKey: 'pk-test' })

    await client.connect()
    expect(mocks.connect).toHaveBeenCalled()

    await client.disconnect()
    expect(mocks.close).toHaveBeenCalled()
  })

  it('calls batch_get with correct arguments', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"children":[]}' }],
    })

    const client = new PencilMcpClient({ cliKey: 'pk-test' })
    await client.connect()

    const result = await client.batchGet({
      filePath: '/tmp/design.pen',
      readDepth: 5,
      resolveInstances: false,
    })

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'batch_get',
      arguments: expect.objectContaining({
        filePath: '/tmp/design.pen',
        readDepth: 5,
        resolveInstances: false,
        resolveVariables: true,
      }),
    })
    expect(result).toEqual({ children: [] })
  })

  it('calls get_variables with correct arguments', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"color.primary":{"type":"color","value":"#FF0000"}}' }],
    })

    const client = new PencilMcpClient()
    await client.connect()

    const result = await client.getVariables('/tmp/design.pen')

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'get_variables',
      arguments: { filePath: '/tmp/design.pen' },
    })
    expect(result).toEqual({ 'color.primary': { type: 'color', value: '#FF0000' } })
  })

  it('calls snapshot_layout with correct arguments', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"problems":[]}' }],
    })

    const client = new PencilMcpClient()
    await client.connect()

    const result = await client.snapshotLayout('/tmp/design.pen', true)

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'snapshot_layout',
      arguments: { filePath: '/tmp/design.pen', problemsOnly: true },
    })
    expect(result).toEqual({ problems: [] })
  })

  it('calls export_nodes with correct arguments', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '["/tmp/assets/hero.png"]' }],
    })

    const client = new PencilMcpClient()
    await client.connect()

    const result = await client.exportNodes({
      nodeIds: ['node1'],
      format: 'png',
      scale: 2,
      outputDir: '/tmp/assets',
    })

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'export_nodes',
      arguments: {
        nodeIds: ['node1'],
        format: 'png',
        scale: 2,
        outputDir: '/tmp/assets',
      },
    })
    expect(result).toEqual(['/tmp/assets/hero.png'])
  })

  it('parses string content directly', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({
      content: '{"key":"value"}',
    })

    const client = new PencilMcpClient()
    await client.connect()

    const result = await client.getVariables('/tmp/design.pen')
    expect(result).toEqual({ key: 'value' })
  })

  it('uses default values for optional batch_get params', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({ content: '[]' })

    const client = new PencilMcpClient()
    await client.connect()

    await client.batchGet({ filePath: 'design.pen' })

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'batch_get',
      arguments: expect.objectContaining({
        readDepth: 10,
        resolveInstances: true,
        resolveVariables: true,
      }),
    })
  })

  it('calls set_variables with correct arguments', async () => {
    const mocks = await getMocks()
    mocks.callTool.mockResolvedValue({ content: 'null' })

    const client = new PencilMcpClient({ cliKey: 'pk-test' })
    await client.connect()

    const variables = {
      'color-primary': { type: 'COLOR', value: '#FF0000' },
      'spacing-md': { type: 'NUMBER', value: 16 },
    }

    await client.setVariables('/tmp/design.pen', variables)

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'set_variables',
      arguments: { filePath: '/tmp/design.pen', variables },
    })
  })

  it('throws when setVariables is called before connect', async () => {
    const client = new PencilMcpClient()
    await expect(
      client.setVariables('/tmp/design.pen', { 'color-primary': { type: 'COLOR', value: '#FF0000' } })
    ).rejects.toThrow('not connected')
  })

  it('converts DesignTokens to flat variable record via designTokensToVariables', () => {
    const tokens = {
      colors: {
        primary: '#FF0000',
        background: '#FFFFFF',
      },
      typography: {
        heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 'bold' },
        body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 'regular' },
        caption: { fontFamily: 'Inter', fontSize: 12, fontWeight: 'regular' },
      },
      spacing: {
        sm: 8,
        md: 16,
      },
      borderRadius: {
        button: 8,
        card: 12,
      },
    }

    const vars = PencilMcpClient.designTokensToVariables(tokens)

    expect(vars['color-primary']).toEqual({ type: 'COLOR', value: '#FF0000' })
    expect(vars['color-background']).toEqual({ type: 'COLOR', value: '#FFFFFF' })
    expect(vars['spacing-sm']).toEqual({ type: 'NUMBER', value: 8 })
    expect(vars['spacing-md']).toEqual({ type: 'NUMBER', value: 16 })
    expect(vars['border-radius-button']).toEqual({ type: 'NUMBER', value: 8 })
    expect(vars['border-radius-card']).toEqual({ type: 'NUMBER', value: 12 })
    expect(vars['font-heading']).toEqual({ type: 'STRING', value: 'Inter' })
    expect(vars['font-size-heading']).toEqual({ type: 'NUMBER', value: 24 })
    expect(vars['font-body']).toEqual({ type: 'STRING', value: 'Inter' })
    expect(vars['font-size-body']).toEqual({ type: 'NUMBER', value: 16 })
  })
})
