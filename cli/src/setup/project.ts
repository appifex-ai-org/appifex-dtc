// Phase 03 Plan 03 (SETUP-01, D-09): Project section — first in SECTION_ORDER.
// Captures appName + projectDir; resolves RESEARCH OQ#3 (eliminates 'MyApp' literal).
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'
import { isAbsolute } from 'node:path'
import { cwd } from 'node:process'

export interface ProjectSectionOpts {
  /** Caller-provided app name; when set, skips the appName prompt. */
  appName?: string
  /** Caller-provided project dir; when set, skips the projectDir prompt. */
  projectDir?: string
}

export async function runProjectSection(
  configDir: string,
  existingConfig: DtcConfig,
  opts: ProjectSectionOpts = {},
): Promise<void> {
  // If both values are pre-supplied by the caller, skip prompts entirely.
  if (opts.appName !== undefined && opts.projectDir !== undefined) {
    const cfg = await loadConfig(configDir)
    await saveConfig(configDir, {
      ...cfg,
      project: { appName: opts.appName, projectDir: opts.projectDir },
    })
    return
  }

  let appName = opts.appName
  let projectDir = opts.projectDir

  if (appName === undefined) {
    const appNameInput = await p.text({
      message: 'App name',
      initialValue: existingConfig.project?.appName ?? '',
      validate: (v) => {
        const trimmed = v.trim()
        if (trimmed.length === 0) return 'App name is required'
        if (trimmed !== v) return 'App name must not have leading or trailing whitespace'
        return undefined
      },
    })
    assertNotCancelled(appNameInput)
    appName = appNameInput as string
  }

  if (projectDir === undefined) {
    const defaultDir = existingConfig.project?.projectDir ?? cwd()
    const projectDirInput = await p.text({
      message: 'Project directory (absolute path)',
      initialValue: defaultDir,
      validate: (v) => {
        if (v.length === 0) return undefined // will use default
        if (!isAbsolute(v)) return 'Must be an absolute path (start with /)'
        return undefined
      },
    })
    assertNotCancelled(projectDirInput)
    projectDir = (projectDirInput as string) || cwd()
    if (!isAbsolute(projectDir)) projectDir = cwd()
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    project: { appName, projectDir },
  })
}
