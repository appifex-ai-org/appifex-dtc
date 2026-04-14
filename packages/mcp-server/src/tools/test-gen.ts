import { generateUITests, generateSpecUnitTests } from '@appifex/test-gen'
import type { PlatformSpec } from '@appifex/core'

export async function handleTestGenUi(
  args: { specJson: string; bundleId?: string },
): Promise<{ text: string; isError: boolean }> {
  try {
    const spec = JSON.parse(args.specJson) as PlatformSpec
    const flows = generateUITests(spec, { bundleId: args.bundleId })
    return {
      text: JSON.stringify({
        flowCount: flows.length,
        flows: flows.map(f => ({ name: f.name, fileName: f.fileName, screenId: f.screenId })),
        content: flows.map(f => ({ fileName: f.fileName, content: f.content })),
      }, null, 2),
      isError: false,
    }
  } catch (err) {
    return {
      text: `UI test generation failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}

export async function handleTestGenUnit(
  args: { specJson: string },
): Promise<{ text: string; isError: boolean }> {
  try {
    const spec = JSON.parse(args.specJson) as PlatformSpec
    const tests = generateSpecUnitTests(spec)
    return {
      text: JSON.stringify({
        fileCount: tests.length,
        totalTests: tests.reduce((sum, t) => sum + t.testCount, 0),
        files: tests.map(t => ({ fileName: t.fileName, testCount: t.testCount, content: t.content })),
      }, null, 2),
      isError: false,
    }
  } catch (err) {
    return {
      text: `Unit test generation failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
