import type { Runner } from '@appifex/core'
import { sanitizeLayerName } from './sanitize.js'
import { join } from 'node:path'
import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises'

export interface StitchScreenLike {
  getHtml(): Promise<string>
  getImage(): Promise<string>
  edit(prompt: string): Promise<StitchScreenLike>
  screenId: string
  /** Phase 7 (DESIGN-03): screen display name for sanitized ID derivation */
  name?: string
}

export interface StitchProjectLike {
  generate(prompt: string, deviceType?: string): Promise<StitchScreenLike>
  /** Phase 7 (DESIGN-03): all screens in the project for spec building */
  screens?: StitchScreenLike[]
}

export interface StitchClientLike {
  createProject(title: string): Promise<StitchProjectLike>
}

export interface StitchOpts {
  apiKey: string
  /** Injectable Stitch SDK client for testing (external API boundary) */
  stitchClient?: StitchClientLike
  /** Injectable fetch for testing (network boundary) */
  fetchImpl?: typeof fetch
}

export interface StitchDesignResult {
  success: boolean
  outputDir: string
  screenshotPaths: string[]
  htmlPaths: string[]
  screenIds: string[]
  previewPath?: string
  error?: string
  /** Phase 7 (DESIGN-03): minimal spec built from sanitized screen names */
  spec?: { screens: Array<{ id: string; name: string }> }
}

export class StitchAdapter {
  private lastScreen: StitchScreenLike | null = null
  private fetchFn: typeof fetch

  constructor(
    private runner: Runner,
    private opts: StitchOpts,
  ) {
    this.fetchFn = opts.fetchImpl ?? globalThis.fetch
  }

  private async getClient(): Promise<StitchClientLike> {
    if (this.opts.stitchClient) return this.opts.stitchClient
    // Dynamic import to avoid bundling SDK when not using Stitch
    // Use string variable to prevent TypeScript from resolving at compile time
    const sdkModule = '@google/stitch-sdk'
    const mod = await import(/* @vite-ignore */ sdkModule)
    // Create a fresh StitchToolClient with the API key (the default `stitch`
    // singleton reads env vars at import time which may be too early)
    const client = new mod.StitchToolClient({ apiKey: this.opts.apiKey })
    return new mod.Stitch(client) as unknown as StitchClientLike
  }

  async create(design: {
    prompt: string
    outputDir: string
    previewPath?: string
  }): Promise<StitchDesignResult> {
    const base: StitchDesignResult = {
      success: false,
      outputDir: design.outputDir,
      screenshotPaths: [],
      htmlPaths: [],
      screenIds: [],
    }

    let screen: StitchScreenLike
    let project: StitchProjectLike
    try {
      const client = await this.getClient()
      project = await client.createProject('dtc-app')
      try {
        screen = await project.generate(design.prompt, 'MOBILE')
      } catch {
        // Stitch API can reject short/generic prompts — retry without device type
        screen = await project.generate(design.prompt)
      }
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }

    // Phase 7 (DESIGN-03): build minimal spec from sanitized screen names
    // using all screens in the project (if available) for parity with adapter expectations
    const spec = buildSpecFromScreens(project!.screens ?? [screen])

    return this.downloadArtifacts(screen, design.outputDir, design.previewPath, base, spec)
  }

  async iterate(design: {
    prompt: string
    outputDir: string
    previewPath?: string
  }): Promise<StitchDesignResult> {
    const base: StitchDesignResult = {
      success: false,
      outputDir: design.outputDir,
      screenshotPaths: [],
      htmlPaths: [],
      screenIds: [],
    }

    if (!this.lastScreen) {
      return { ...base, error: 'No previous screen to edit — call create() first' }
    }

    let screen: StitchScreenLike
    try {
      screen = await this.lastScreen.edit(design.prompt)
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }

    const spec = buildSpecFromScreens([screen])
    return this.downloadArtifacts(screen, design.outputDir, design.previewPath, base, spec)
  }

  private async downloadArtifacts(
    screen: StitchScreenLike,
    outputDir: string,
    previewPath: string | undefined,
    base: StitchDesignResult,
    spec: StitchDesignResult['spec'],
  ): Promise<StitchDesignResult> {
    this.lastScreen = screen

    try {
      const htmlUrl = await screen.getHtml()
      const imageUrl = await screen.getImage()

      const [htmlResp, imageResp] = await Promise.all([
        this.fetchFn(htmlUrl),
        this.fetchFn(imageUrl),
      ])

      if (!htmlResp.ok || !imageResp.ok) {
        return {
          ...base,
          error: `Failed to download artifacts (HTML: ${htmlResp.ok}, image: ${imageResp.ok})`,
        }
      }

      const htmlContent = await htmlResp.text()
      const imageBuffer = Buffer.from(await imageResp.arrayBuffer())

      const htmlPath = join(outputDir, 'screen-0.html')
      const pngPath = join(outputDir, 'screen-0.png')

      await mkdir(outputDir, { recursive: true })
      await this.runner.writeFile(htmlPath, htmlContent)
      // Write PNG as raw binary (runner.writeFile is string-only)
      await fsWriteFile(pngPath, imageBuffer)

      if (previewPath) {
        await fsWriteFile(previewPath, imageBuffer)
      }

      return {
        success: true,
        outputDir,
        screenshotPaths: [pngPath],
        htmlPaths: [htmlPath],
        screenIds: [screen.screenId],
        spec,
        previewPath,
      }
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/**
 * Phase 7 (DESIGN-03): Build a minimal spec from Stitch screens using sanitized screen names.
 * Uses each screen's `name` property (if present) to derive a safe identifier.
 */
function buildSpecFromScreens(
  screens: StitchScreenLike[],
): StitchDesignResult['spec'] {
  const taken = new Set<string>()
  return {
    screens: screens.map((s) => ({
      id: sanitizeLayerName(s.name ?? s.screenId, taken),
      name: s.name ?? s.screenId,
    })),
  }
}
