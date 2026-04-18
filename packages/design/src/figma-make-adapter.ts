import type {
  DesignToolAdapter,
  DesignToolCreateOpts,
  DesignToolIterateOpts,
  DesignToolResult,
  Runner,
} from '@appifex/core'
import { sanitizeLayerName } from './sanitize.js'
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

/** Phase 7 (DESIGN-02): extended create opts that accept runner injection for tests */
export interface FigmaMakeCreateOpts extends DesignToolCreateOpts {
  runner?: Runner
}

export class FigmaMakeAdapter implements DesignToolAdapter {
  readonly tool = 'figma-make' as const
  private fileUrl: string | undefined
  private runner: Runner | undefined

  // Phase 7 (DESIGN-02): support both (runner, opts) and (opts) constructor forms
  // so that test fixtures can pass runner through create() instead
  constructor(runnerOrOpts: Runner | FigmaMakeOpts, opts?: FigmaMakeOpts) {
    if (opts !== undefined) {
      // Two-arg form: FigmaMakeAdapter(runner, opts)
      this.runner = runnerOrOpts as Runner
      this.opts = opts
    } else {
      // One-arg form: FigmaMakeAdapter(opts) — runner may be passed via create()
      this.runner = undefined
      this.opts = runnerOrOpts as FigmaMakeOpts
    }
    this.fileUrl = this.opts.figmaFileUrl
  }

  private opts: FigmaMakeOpts

  private async getClient(): Promise<FigmaMcpClientLike> {
    if (this.opts.mcpClient) return this.opts.mcpClient
    if (!this.opts.figmaToken) {
      throw new Error(
        'Figma token is required — run `dtc setup` and select Figma Make, or set FIGMA_TOKEN',
      )
    }
    const { FigmaRestClient } = await import('./figma-rest-client.js')
    return new FigmaRestClient({ token: this.opts.figmaToken })
  }

  async create(opts: FigmaMakeCreateOpts): Promise<DesignToolResult> {
    const runner = opts.runner ?? this.runner
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
      return {
        ...base,
        error:
          'Figma file URL is required — set figmaFileUrl in config or provide via --design flag',
      }
    }

    if (!runner) {
      return { ...base, error: 'Runner is required — pass runner to create() or constructor' }
    }

    return this.readDesign(this.fileUrl, figmaDir, opts.previewPath, base, runner)
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

    if (!this.runner) {
      return { ...base, error: 'Runner is required — pass runner to constructor' }
    }

    return this.readDesign(this.fileUrl, figmaDir, opts.previewPath, base, this.runner)
  }

  /** Write binary data via runner — uses base64 shell decode for remote runner compat */
  private async writeBinary(path: string, data: Buffer, runner: Runner): Promise<void> {
    // Encode as base64 and decode on the runner side so binary data
    // travels correctly even over remote runner transports.
    // Phase 7 (CR-01): escape single quotes in b64 and path to prevent shell injection.
    // Standard base64 never contains `'`, but defensive escaping protects against
    // encoding variants and attacker-influenced outputDir values.
    const b64 = data.toString('base64')
    const safeB64 = b64.replace(/'/g, "'\\''")
    const safePath = path.replace(/'/g, "'\\''")
    await runner.exec('sh', ['-c', `printf '%s' '${safeB64}' | base64 -d > '${safePath}'`])
  }

  private async readDesign(
    fileUrl: string,
    outputDir: string,
    previewPath: string | undefined,
    base: DesignToolResult,
    runner: Runner,
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
      ;[context, screenshot] = await Promise.all([
        client.getDesignContext({ fileUrl }),
        client.getScreenshot({ fileUrl }),
      ])
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }

    try {
      await runner.exec('mkdir', ['-p', outputDir])

      // Write HTML/code artifact via runner (works with remote runners)
      const htmlPath = join(outputDir, 'screen-0.html')
      await runner.writeFile(htmlPath, context.code)

      // Write PNG as raw binary — runner.writeFile is string-only,
      // so we use base64-encoded content via runner.writeFile for
      // remote compatibility, falling back to fs for local
      const pngPath = join(outputDir, 'screen-0.png')
      await this.writeBinary(pngPath, screenshot, runner)

      if (previewPath) {
        await this.writeBinary(previewPath, screenshot, runner)
      }

      // Phase 7 (DESIGN-02): build minimal spec from sanitized screen names
      // so that parity tests and downstream consumers see safe identifiers
      const takenScreens = new Set<string>()
      const specScreens = context.screenNames.map((rawName) => ({
        id: sanitizeLayerName(rawName, takenScreens),
        name: rawName,
      }))

      return {
        success: true,
        tool: 'figma-make',
        outputDir,
        designFilePath: undefined,
        screenshotPaths: [pngPath],
        htmlPaths: [htmlPath],
        screenIds: context.screenNames,
        spec: { screens: specScreens },
        previewPath,
      } as DesignToolResult & { spec: { screens: Array<{ id: string; name: string }> } }
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
