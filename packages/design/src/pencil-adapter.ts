import type { Runner } from '@appifex/core'

export interface PencilOpts {
  cliKey: string
}

export interface CreateDesignOpts {
  prompt: string
  outputPath: string
  exportPath?: string
}

export interface IterateDesignOpts {
  inputPath: string
  outputPath: string
  prompt: string
  exportPath?: string
}

export interface DesignResult {
  success: boolean
  penPath: string
  exportedPath?: string
  error?: string
}

export class PencilAdapter {
  constructor(
    private runner: Runner,
    private opts: PencilOpts,
  ) {}

  async create(design: CreateDesignOpts): Promise<DesignResult> {
    const args = ['--prompt', design.prompt, '--out', design.outputPath]
    if (design.exportPath) {
      args.push('--export', design.exportPath)
    }

    const env = this.opts.cliKey ? { PENCIL_CLI_KEY: this.opts.cliKey } : undefined
    const result = await this.runner.exec('pencil', args, { env })

    if (result.exitCode !== 0) {
      return { success: false, penPath: design.outputPath, error: result.stderr }
    }

    return {
      success: true,
      penPath: design.outputPath,
      exportedPath: design.exportPath,
    }
  }

  async iterate(design: IterateDesignOpts): Promise<DesignResult> {
    const args = [
      '--in', design.inputPath,
      '--out', design.outputPath,
      '--prompt', design.prompt,
    ]
    if (design.exportPath) {
      args.push('--export', design.exportPath)
    }

    const env = this.opts.cliKey ? { PENCIL_CLI_KEY: this.opts.cliKey } : undefined
    const result = await this.runner.exec('pencil', args, { env })

    if (result.exitCode !== 0) {
      return { success: false, penPath: design.outputPath, error: result.stderr }
    }

    return {
      success: true,
      penPath: design.outputPath,
      exportedPath: design.exportPath,
    }
  }
}
