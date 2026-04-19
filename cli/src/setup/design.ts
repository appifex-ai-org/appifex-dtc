// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runDesignSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const design = await p.select({
    message: 'Design tool',
    options: [
      { value: 'pencil', label: 'Pencil', hint: 'AI-native design (requires Pencil desktop app)' },
      {
        value: 'stitch',
        label: 'Google Stitch',
        hint: 'Google AI design (requires API key from stitch.withgoogle.com)',
      },
      {
        value: 'figma-make',
        label: 'Figma Make',
        hint: 'Figma AI design (requires Figma Personal Access Token)',
      },
    ],
  })
  assertNotCancelled(design)

  let designApiKey: string | undefined = existingConfig.design?.apiKey
  let figmaToken: string | undefined = existingConfig.design?.figmaToken
  let figmaFileUrl: string | undefined = existingConfig.design?.figmaFileUrl

  if (design === 'stitch') {
    const keyInput = await p.password({
      message: 'Stitch API key (from stitch.withgoogle.com)',
      validate: (v) => (v.length === 0 ? 'API key is required for Stitch' : undefined),
    })
    assertNotCancelled(keyInput)
    designApiKey = keyInput as string
  } else if (design === 'figma-make') {
    const tokenInput = await p.password({
      message: 'Figma Personal Access Token (from figma.com/developers)',
      validate: (v) => (v.length === 0 ? 'Token is required for Figma Make' : undefined),
    })
    assertNotCancelled(tokenInput)
    figmaToken = tokenInput as string

    const urlInput = await p.text({
      message: 'Figma file URL (e.g. https://www.figma.com/design/ABC123/MyApp)',
      placeholder: 'https://www.figma.com/design/...',
      initialValue: existingConfig.design?.figmaFileUrl ?? '',
      validate: (v) => {
        if (v.length === 0) return undefined // optional — can be provided later via --design
        if (!v.match(/figma\.com\/(?:design|file)\//)) return 'Must be a Figma design or file URL'
        return undefined
      },
    })
    assertNotCancelled(urlInput)
    if (urlInput) figmaFileUrl = urlInput as string
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    design: {
      tool: design as DtcConfig['design']['tool'],
      apiKey: designApiKey,
      figmaToken,
      figmaFileUrl,
    },
  })
}
