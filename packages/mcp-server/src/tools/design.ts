import { createDesignAdapter } from '@appifex/design'
import type { DesignConfig, Runner } from '@appifex/core'

export async function handleDesignCreate(
  args: { prompt: string; outputPath: string; exportPath?: string },
  runner: Runner,
  config: DesignConfig,
): Promise<{ text: string; isError: boolean }> {
  const adapter = createDesignAdapter({ config, runner })
  const { dirname } = await import('node:path')
  const outputDir = dirname(args.outputPath)
  const result = await adapter.create({
    prompt: args.prompt,
    outputDir,
    outputPath: args.outputPath,
    previewPath: args.exportPath,
  })
  return {
    text: JSON.stringify(result, null, 2),
    isError: !result.success,
  }
}

export async function handleDesignIterate(
  args: { inputPath: string; outputPath: string; prompt: string; exportPath?: string },
  runner: Runner,
  config: DesignConfig,
): Promise<{ text: string; isError: boolean }> {
  const adapter = createDesignAdapter({ config, runner })
  const { dirname } = await import('node:path')
  const outputDir = dirname(args.outputPath)
  const result = await adapter.iterate({
    prompt: args.prompt,
    outputDir,
    inputPath: args.inputPath,
    outputPath: args.outputPath,
    previewPath: args.exportPath,
  })
  return {
    text: JSON.stringify(result, null, 2),
    isError: !result.success,
  }
}
