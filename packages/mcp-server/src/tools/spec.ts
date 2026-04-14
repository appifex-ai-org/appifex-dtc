import { extractSpec, translateSpec } from '@appifex/spec'
import type { Platform } from '@appifex/core'
import { readFile } from 'node:fs/promises'

export async function handleSpecExtract(
  args: { filePath: string },
): Promise<{ text: string; isError: boolean }> {
  try {
    const content = await readFile(args.filePath, 'utf-8')
    const spec = extractSpec(content)
    return {
      text: JSON.stringify(spec, null, 2),
      isError: false,
    }
  } catch (err) {
    return {
      text: `Spec extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}

export async function handleSpecTranslate(
  args: { specJson: string; platform: string },
): Promise<{ text: string; isError: boolean }> {
  try {
    const spec = JSON.parse(args.specJson)
    const platformSpec = translateSpec(spec, args.platform as Platform)
    return {
      text: JSON.stringify(platformSpec, null, 2),
      isError: false,
    }
  } catch (err) {
    return {
      text: `Spec translation failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
