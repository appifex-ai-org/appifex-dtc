import { existsSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { DesignTokens } from '@appifex/core'

export interface PencilMcpOpts {
  /** Path to the Pencil MCP server binary. Auto-detected if omitted. */
  mcpServerBin?: string
  /** CLI key for authentication */
  cliKey?: string
}

/** Auto-detect the Pencil MCP server binary path */
function detectMcpServerBin(): string {
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const desktopPath = `/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-${arch}`
    if (existsSync(desktopPath)) return desktopPath
  }
  // Fallback: try pencil CLI (may not support 'mcp' subcommand)
  return 'pencil'
}

export interface BatchGetOpts {
  filePath: string
  nodeIds?: string[]
  patterns?: string[]
  readDepth?: number
  resolveInstances?: boolean
  resolveVariables?: boolean
}

export interface SnapshotLayoutResult {
  problems: Array<{
    nodeId: string
    nodeName?: string
    type: string
    message: string
  }>
}

export interface ExportNodesOpts {
  nodeIds: string[]
  format?: 'png' | 'jpeg' | 'webp' | 'pdf'
  scale?: number
  outputDir: string
}

export class PencilMcpClient {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private opts: PencilMcpOpts

  constructor(opts: PencilMcpOpts = {}) {
    this.opts = opts
  }

  async connect(): Promise<void> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v != null) env[k] = v
    }
    if (this.opts.cliKey) env.PENCIL_CLI_KEY = this.opts.cliKey

    const bin = this.opts.mcpServerBin ?? detectMcpServerBin()
    const args = bin.includes('mcp-server') ? ['--app', 'desktop'] : ['mcp']

    this.transport = new StdioClientTransport({ command: bin, args, env })

    this.client = new Client({ name: 'dtc-pipeline', version: '0.1.0' })
    await this.client.connect(this.transport)
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.transport = null
    }
  }

  async batchGet(opts: BatchGetOpts): Promise<unknown> {
    this.ensureConnected()
    const result = await this.client!.callTool({
      name: 'batch_get',
      arguments: {
        filePath: opts.filePath,
        nodeIds: opts.nodeIds,
        patterns: opts.patterns,
        readDepth: opts.readDepth ?? 10,
        resolveInstances: opts.resolveInstances ?? true,
        resolveVariables: opts.resolveVariables ?? true,
      },
    })
    return this.parseToolResult(result as Record<string, unknown>)
  }

  async getVariables(
    filePath: string,
  ): Promise<Record<string, { type: string; value: string | number }>> {
    this.ensureConnected()
    const result = await this.client!.callTool({
      name: 'get_variables',
      arguments: { filePath },
    })
    return this.parseToolResult(result as Record<string, unknown>) as Record<
      string,
      { type: string; value: string | number }
    >
  }

  async setVariables(
    filePath: string,
    variables: Record<string, { type: string; value: string | number }>,
  ): Promise<void> {
    this.ensureConnected()
    await this.client!.callTool({
      name: 'set_variables',
      arguments: { filePath, variables },
    })
  }

  static designTokensToVariables(
    tokens: DesignTokens,
  ): Record<string, { type: string; value: string | number }> {
    const vars: Record<string, { type: string; value: string | number }> = {}
    for (const [name, hex] of Object.entries(tokens.colors)) {
      vars[`color-${name}`] = { type: 'COLOR', value: hex }
    }
    for (const [name, val] of Object.entries(tokens.spacing)) {
      vars[`spacing-${name}`] = { type: 'NUMBER', value: val }
    }
    for (const [name, val] of Object.entries(tokens.borderRadius)) {
      vars[`border-radius-${name}`] = { type: 'NUMBER', value: val }
    }
    // Typography: flatten heading/body/caption font families and sizes
    for (const [role, typo] of Object.entries(tokens.typography)) {
      if (typo.fontFamily) vars[`font-${role}`] = { type: 'STRING', value: typo.fontFamily }
      if (typo.fontSize) vars[`font-size-${role}`] = { type: 'NUMBER', value: typo.fontSize }
    }
    return vars
  }

  async snapshotLayout(filePath: string, problemsOnly = true): Promise<SnapshotLayoutResult> {
    this.ensureConnected()
    const result = await this.client!.callTool({
      name: 'snapshot_layout',
      arguments: { filePath, problemsOnly },
    })
    return this.parseToolResult(result as Record<string, unknown>) as SnapshotLayoutResult
  }

  async exportNodes(opts: ExportNodesOpts): Promise<string[]> {
    this.ensureConnected()
    const result = await this.client!.callTool({
      name: 'export_nodes',
      arguments: {
        nodeIds: opts.nodeIds,
        format: opts.format ?? 'png',
        scale: opts.scale ?? 2,
        outputDir: opts.outputDir,
      },
    })
    return this.parseToolResult(result as Record<string, unknown>) as string[]
  }

  private ensureConnected(): void {
    if (!this.client) throw new Error('PencilMcpClient not connected. Call connect() first.')
  }

  private parseToolResult(result: Record<string, unknown>): unknown {
    const content = result.content
    if (typeof content === 'string') return this.safeJsonParse(content)
    if (Array.isArray(content) && content.length > 0) {
      // MCP tool results come as content blocks — extract text
      const textBlock = content.find((b: { type?: string }) => b.type === 'text')
      if (textBlock && 'text' in textBlock) return this.safeJsonParse(textBlock.text as string)
    }
    return content
  }

  private safeJsonParse(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`Pencil MCP returned invalid JSON: ${raw.slice(0, 200)}`)
    }
  }
}
