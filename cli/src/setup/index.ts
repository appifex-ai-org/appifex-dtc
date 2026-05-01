// Phase 03 Plan 03 (SETUP-01, D-09, D-10): sectioned wizard composer.
// Firebase added by Plan 03-04 — inserted between 'runner' and 'oauth'.
// 'project' is FIRST so downstream sections (Firebase D-02, OAuth D-07) can read appName/projectDir.
import { loadConfig, ConfigError } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_CONFIG_DIR = join(homedir(), '.dtc')
import { runProjectSection } from './project.js'
import { runLlmSection } from './llm.js'
import { runDesignSection } from './design.js'
import { runRunnerSection } from './runner.js'
// Phase 03 Plan 04 (SETUP-04): Firebase provisioning section.
import { runFirebaseSection } from './firebase.js'
import { runAppleSection } from './apple.js'
import { runAndroidSection } from './android.js'
import { runDeliverSection } from './deliver.js'
import { runBudgetSection } from './budget.js'
import { runOauthSection } from './oauth.js'

export type SectionName =
  | 'project'
  | 'llm'
  | 'design'
  | 'runner'
  | 'firebase'
  | 'apple'
  | 'android'
  | 'deliver'
  | 'budget'
  | 'oauth'

export const SECTION_ORDER: SectionName[] = [
  'project',
  'llm',
  'design',
  'runner',
  'firebase',
  'apple',
  'android',
  'deliver',
  'budget',
  'oauth',
]

export const QUICK_SECTION_ORDER: SectionName[] = ['project', 'llm', 'design', 'runner', 'budget']

export interface SetupWizardOpts {
  only?: SectionName
  /**
   * Force all production sections.
   *
   * Plain `dtc setup` is intentionally a quick local setup for first-time users:
   * project, LLM, design tool, runner, budget. `dtc setup --full` additionally
   * configures Firebase, Apple/TestFlight, Android, git delivery, and OAuth.
   */
  full?: boolean
  /** Caller-provided app name; when set, project section skips the appName prompt. */
  appName?: string
  /** Caller-provided project dir; when set, project section skips the projectDir prompt. */
  projectDir?: string
}

export const SECTIONS: Record<
  SectionName,
  (dir: string, cfg: DtcConfig, opts?: SetupWizardOpts) => Promise<void>
> = {
  project: (dir, cfg, opts) =>
    runProjectSection(dir, cfg, { appName: opts?.appName, projectDir: opts?.projectDir }),
  llm: runLlmSection,
  design: runDesignSection,
  runner: runRunnerSection,
  // Phase 03 Plan 04 (SETUP-04, D-02): reads appName from cfg.project (set by runProjectSection)
  // or from caller-supplied opts. Hard-fails when appName is absent — no 'MyApp' fallback.
  firebase: async (dir, cfg, opts) => {
    const appName = opts?.appName ?? cfg.project?.appName
    const projectDir = opts?.projectDir ?? cfg.project?.projectDir ?? process.cwd()
    if (!appName) {
      throw new ConfigError(
        'Firebase setup requires an app name. Run `dtc setup project` first, or pass --app-name <name>.',
      )
    }
    await runFirebaseSection(dir, cfg, { appName, projectDir })
  },
  apple: runAppleSection,
  android: runAndroidSection,
  deliver: runDeliverSection,
  budget: runBudgetSection,
  oauth: runOauthSection,
}

/**
 * Runs the setup wizard.
 *
 * When both `opts.appName` and `opts.projectDir` are supplied, the project section
 * skips its prompts (caller-provided values take precedence).
 */
export async function setupWizard(configDir?: string, opts: SetupWizardOpts = {}): Promise<void> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR
  const cfg = await loadConfig(dir)

  // When both appName and projectDir are provided, skip the project section entirely
  const hasCallerProject = opts.appName !== undefined && opts.projectDir !== undefined

  if (opts.only) {
    const fn = SECTIONS[opts.only]
    if (!fn) throw new ConfigError(`Unknown section: ${opts.only}`)
    await fn(dir, cfg, opts)
    return
  }

  const order = opts.full ? SECTION_ORDER : QUICK_SECTION_ORDER
  if (opts.full) {
    console.log('Running full production setup: Firebase, stores, delivery, and OAuth included.')
  } else {
    console.log(
      'Running quick local setup. Use `dtc setup --full` later for Firebase, TestFlight, Play Console, and delivery.',
    )
  }

  for (const name of order) {
    // Skip project section when caller has pre-supplied both values
    if (name === 'project' && hasCallerProject) {
      continue
    }
    await SECTIONS[name](dir, cfg, opts)
  }

  if (!opts.full) {
    console.log(
      [
        'Quick setup complete.',
        'Firebase is only needed for production backend wiring.',
        'When ready, run `dtc setup firebase` or `dtc setup --full`.',
      ].join('\n'),
    )
  }
}

/** Run a single named section. */
export async function runSection(configDir: string, name: SectionName): Promise<void> {
  return setupWizard(configDir, { only: name })
}
