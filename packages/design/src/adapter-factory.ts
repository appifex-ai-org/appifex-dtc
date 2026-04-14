import type {
  DesignConfig,
  DesignToolAdapter,
  DesignToolCreateOpts,
  DesignToolIterateOpts,
  DesignToolResult,
  Runner,
} from '@appifex/core'
import { join } from 'node:path'
import { PencilAdapter } from './pencil-adapter.js'
import { StitchAdapter } from './stitch-adapter.js'
import { FigmaMakeAdapter } from './figma-make-adapter.js'

/**
 * Wraps PencilAdapter behind the unified DesignToolAdapter interface.
 * Maps outputDir → design.pen path internally.
 */
class PencilToolAdapter implements DesignToolAdapter {
  readonly tool = 'pencil' as const
  private pencil: PencilAdapter

  constructor(runner: Runner, cliKey: string) {
    this.pencil = new PencilAdapter(runner, { cliKey })
  }

  async create(opts: DesignToolCreateOpts): Promise<DesignToolResult> {
    const designPath = opts.outputPath ?? join(opts.outputDir, 'design.pen')
    const result = await this.pencil.create({
      prompt: opts.prompt,
      outputPath: designPath,
      exportPath: opts.previewPath,
    })
    return {
      success: result.success,
      error: result.error,
      tool: 'pencil',
      outputDir: opts.outputDir,
      designFilePath: result.penPath,
      screenshotPaths: result.exportedPath ? [result.exportedPath] : [],
      htmlPaths: [],
      screenIds: [],
      previewPath: result.exportedPath,
    }
  }

  async iterate(opts: DesignToolIterateOpts): Promise<DesignToolResult> {
    const designPath = opts.outputPath ?? join(opts.outputDir, 'design.pen')
    const inputPath = opts.inputPath ?? designPath
    const result = await this.pencil.iterate({
      inputPath,
      outputPath: designPath,
      prompt: opts.prompt,
      exportPath: opts.previewPath,
    })
    return {
      success: result.success,
      error: result.error,
      tool: 'pencil',
      outputDir: opts.outputDir,
      designFilePath: result.penPath,
      screenshotPaths: result.exportedPath ? [result.exportedPath] : [],
      htmlPaths: [],
      screenIds: [],
      previewPath: result.exportedPath,
    }
  }
}

/**
 * Wraps StitchAdapter behind the unified DesignToolAdapter interface.
 * Maps outputDir → .stitch/ subdirectory internally.
 */
class StitchToolAdapter implements DesignToolAdapter {
  readonly tool = 'stitch' as const
  private stitch: StitchAdapter

  constructor(
    runner: Runner,
    opts: { apiKey: string; stitchClient?: unknown; fetchImpl?: typeof fetch },
  ) {
    this.stitch = new StitchAdapter(runner, opts as ConstructorParameters<typeof StitchAdapter>[1])
  }

  async create(opts: DesignToolCreateOpts): Promise<DesignToolResult> {
    const stitchDir = join(opts.outputDir, '.stitch')
    const result = await this.stitch.create({
      prompt: opts.prompt,
      outputDir: stitchDir,
      previewPath: opts.previewPath,
    })
    return {
      success: result.success,
      error: result.error,
      tool: 'stitch',
      outputDir: stitchDir,
      screenshotPaths: result.screenshotPaths,
      htmlPaths: result.htmlPaths,
      screenIds: result.screenIds,
      previewPath: result.previewPath,
    }
  }

  async iterate(opts: DesignToolIterateOpts): Promise<DesignToolResult> {
    const stitchDir = join(opts.outputDir, '.stitch')
    const result = await this.stitch.iterate({
      prompt: opts.prompt,
      outputDir: stitchDir,
      previewPath: opts.previewPath,
    })
    return {
      success: result.success,
      error: result.error,
      tool: 'stitch',
      outputDir: stitchDir,
      screenshotPaths: result.screenshotPaths,
      htmlPaths: result.htmlPaths,
      screenIds: result.screenIds,
      previewPath: result.previewPath,
    }
  }
}

export interface CreateDesignAdapterOpts {
  config: DesignConfig
  runner: Runner
}

/**
 * Creates the appropriate DesignToolAdapter based on config.design.tool.
 */
export function createDesignAdapter({
  config,
  runner,
}: CreateDesignAdapterOpts): DesignToolAdapter {
  const tool = config.tool
  switch (tool) {
    case 'pencil': {
      const cliKey = config.apiKey || process.env.PENCIL_CLI_KEY || ''
      return new PencilToolAdapter(runner, cliKey)
    }
    case 'stitch': {
      const apiKey = config.apiKey || process.env.STITCH_API_KEY || ''
      return new StitchToolAdapter(runner, { apiKey })
    }
    case 'figma-make': {
      const figmaToken = config.figmaToken || process.env.FIGMA_TOKEN || ''
      return new FigmaMakeAdapter(runner, { figmaToken, figmaFileUrl: config.figmaFileUrl })
    }
    default:
      throw new Error(`Unknown design tool: ${tool as string}`)
  }
}
