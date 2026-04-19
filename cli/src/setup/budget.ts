// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runBudgetSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const wantSkills = await p.confirm({
    message: 'Custom skills directory? (codegen/fix prompts)',
    initialValue: existingConfig.skillsDir != null,
  })
  assertNotCancelled(wantSkills)

  let skillsDir: string | undefined = existingConfig.skillsDir

  if (wantSkills) {
    const skillsInput = await p.text({
      message: 'Skills directory path',
      placeholder: './skills',
      initialValue: existingConfig.skillsDir ?? '',
      validate: (v) => (v.length === 0 ? 'Path is required' : undefined),
    })
    assertNotCancelled(skillsInput)
    skillsDir = skillsInput as string
  }

  const budgetInput = await p.text({
    message: 'Token budget (total)',
    initialValue: String(existingConfig.tokenBudget?.total ?? 100000),
    validate: (v) => (isNaN(Number(v)) ? 'Must be a number' : undefined),
  })
  assertNotCancelled(budgetInput)
  const tokenBudget = Number(budgetInput)

  const cfg = await loadConfig(configDir)
  const updates: Partial<DtcConfig> = {
    tokenBudget: { total: tokenBudget },
  }
  if (skillsDir) updates.skillsDir = skillsDir
  await saveConfig(configDir, { ...cfg, ...updates })
}
