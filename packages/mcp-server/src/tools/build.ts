import { buildSwift, buildKotlin } from '@appifex/build'
import type { Runner, Platform } from '@appifex/core'

export async function handleBuild(
  args: { platform: string; projectDir: string; scheme?: string },
  runner: Runner,
): Promise<{ text: string; isError: boolean }> {
  const platform = args.platform as Platform
  const result = platform === 'swiftui'
    ? await buildSwift(runner, { projectDir: args.projectDir, scheme: args.scheme ?? 'App' })
    : await buildKotlin(runner, { projectDir: args.projectDir })

  return {
    text: JSON.stringify(result, null, 2),
    isError: !result.success,
  }
}
