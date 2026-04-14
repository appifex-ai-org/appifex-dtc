import type { DesignToolAdapter, DesignToolCreateOpts, DesignToolIterateOpts, DesignToolResult, Runner } from '@appifex/core'
import { join } from 'node:path'

export interface FigmaDesignContext {
  code: string
  metadata: Record<string, unknown>
  screenNames: string[]
}

export interface FigmaMcpClientLike {
  getDesignContext(opts: { fileUrl: string; nodeId?: string }): Promise<FigmaDesignContext>
  getScreenshot(opts: { fileUrl: string; nodeId?: string }): Promise<Buffer>
}

export interface FigmaMakeOpts {
  figmaToken: string
  figmaFileUrl?: string
  /** Injectable MCP client for testing (external API boundary) */
  mcpClient?: FigmaMcpClientLike
}

export class FigmaMakeAdapter implements DesignToolAdapter {
  readonly tool = 'figma-make' as const
  private fileUrl: string | undefined

  constructor(
    private runner: Runner,
    private opts: FigmaMakeOpts,
  ) {
    this.fileUrl = opts.figmaFileUrl
  }

  private async getClient(): Promise<FigmaMcpClientLike> {
    if (this.opts.mcpClient) return this.opts.mcpClient
    if (!this.opts.figmaToken) {
      throw new Error('Figma token is required — run `dtc setup` and select Figma Make, or set FIGMA_TOKEN')
    }
    const { FigmaRestClient } = await import('./figma-rest-client.js')
    return new FigmaRestClient({ token: this.opts.figmaToken })
  }

  async create(opts: DesignToolCreateOpts): Promise<DesignToolResult> {
    const figmaDir = join(opts.outputDir, '.figma-make')
    const base: DesignToolResult = {
      success: false,
      tool: 'figma-make',
      outputDir: figmaDir,
      screenshotPaths: [],
      htmlPaths: [],
      screenIds: [],
    }

    if (!this.fileUrl) {
      return { ...base, error: 'Figma file URL is required — set figmaFileUrl in config or provide via --design flag' }
    }

    return this.readDesign(this.fileUrl, figmaDir, opts.previewPath, base)
  }

  async iterate(opts: DesignToolIterateOpts): Promise<DesignToolResult> {
    const figmaDir = join(opts.outputDir, '.figma-make')
    const base: DesignToolResult = {
      success: false,
      tool: 'figma-make',
      outputDir: figmaDir,
      screenshotPaths: [],
      htmlPaths: [],
      screenIds: [],
    }

    if (!this.fileUrl) {
      return { ...base, error: 'No Figma file URL — call create() first' }
    }

    return this.readDesign(this.fileUrl, figmaDir, opts.previewPath, base)
  }

  /** Write binary data via runner — uses base64 shell decode for remote runner compat */
  private async writeBinary(path: string, data: Buffer): Promise<void> {
    // Encode as base64 and decode on the runner side so binary data
    // travels correctly even over remote runner transports
    const b64 = data.toString('base64')
    await this.runner.exec('sh', ['-c', `echo '${b64}' | base64 -d > '${path}'`])
  }

  private async readDesign(
    fileUrl: string,
    outputDir: string,
    previewPath: string | undefined,
    base: DesignToolResult,
  ): Promise<DesignToolResult> {
    let client: FigmaMcpClientLike
    try {
      client = await this.getClient()
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }

    let context: FigmaDesignContext
    let screenshot: Buffer
    try {
      [context, screenshot] = await Promise.all([
        client.getDesignContext({ fileUrl }),
        client.getScreenshot({ fileUrl }),
      ])
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }

    try {
      await this.runner.exec('mkdir', ['-p', outputDir])

      // Write HTML/code artifact via runner (works with remote runners)
      const htmlPath = join(outputDir, 'screen-0.html')
      await this.runner.writeFile(htmlPath, context.code)

      // Write PNG as raw binary — runner.writeFile is string-only,
      // so we use base64-encoded content via runner.writeFile for
      // remote compatibility, falling back to fs for local
      const pngPath = join(outputDir, 'screen-0.png')
      await this.writeBinary(pngPath, screenshot)

      if (previewPath) {
        await this.writeBinary(previewPath, screenshot)
      }

      return {
        success: true,
        tool: 'figma-make',
        outputDir,
        designFilePath: undefined,
        screenshotPaths: [pngPath],
        htmlPaths: [htmlPath],
        screenIds: context.screenNames,
        previewPath,
      }
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
