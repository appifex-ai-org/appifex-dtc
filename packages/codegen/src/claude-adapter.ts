import { join } from 'node:path'
import type { Runner } from '@appifex/core'
import type { CodegenAdapter, CodegenInput, CodegenResult } from './types.js'

export type GenerateFn = (input: CodegenInput) => Promise<CodegenResult>

export interface ClaudeAdapterOpts {
  generateFn: GenerateFn
}

export class ClaudeAdapter implements CodegenAdapter {
  name = 'claude'
  private generateFn: GenerateFn

  constructor(opts: ClaudeAdapterOpts) {
    this.generateFn = opts.generateFn
  }

  async generate(input: CodegenInput): Promise<CodegenResult> {
    return this.generateFn(input)
  }

  /** Files managed by the build pipeline — never overwrite with LLM output */
  private static PROTECTED_FILES = new Set([
    'project.yml',
    'App.xcodeproj',
    'Info.plist',
  ])

  async generateAndWrite(input: CodegenInput, runner: Runner): Promise<CodegenResult> {
    const result = await this.generate(input)
    if (result.success) {
      for (const file of result.files) {
        const basename = file.path.split('/').pop() ?? file.path
        if (ClaudeAdapter.PROTECTED_FILES.has(basename)) continue
        const fullPath = join(input.outputDir, file.path)
        await runner.writeFile(fullPath, file.content)
      }
    }
    return result
  }
}
