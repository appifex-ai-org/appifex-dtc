/**
 * Phase 6 (VAL-01 D-01 D-02 D-04 D-05 D-06): e2e_gate phase orchestrator.
 *
 * Writes a self-contained Maestro flow YAML to {projectDir}/.maestro/e2e/e2e-gate.yaml,
 * delegates to the existing runMaestro helper, and returns the MaestroResult. On Maestro
 * failure, throws E2eGateError (extends CliError per Phase 2 FOUND-04). The pipeline
 * caller (cli/src/pipeline.ts runE2eGate block, Plan 06-07) decides whether to rethrow
 * based on opts.skipValidationGate per D-16.
 *
 * Reuses runMaestro as-is (D-06) — no fork, no new runner. Flow is single-file per D-04;
 * signup-then-signIn-fallback via `runFlow { when: { visible: { id: signIn_existingAccount } } }`.
 *
 * Firestore round-trip uses extendedWaitUntil with timeout 15000-20000ms to absorb cold-
 * simulator first-sync latency (06-RESEARCH Pitfall 2).
 */
import type { Platform, Runner } from '@appifex/core'
import { E2eGateError } from '@appifex/core'
import { runMaestro, type MaestroResult } from './maestro.js'

export interface E2eGatePhaseOpts {
  runner: Runner
  projectDir: string
  platform: Platform
  /** Bundle ID for the generated app (e.g. 'com.example.App'). Passed to Maestro as APP_ID. */
  appId?: string
  /** Destination for Maestro's JUnit / hierarchy output. */
  reportDir: string
}

/**
 * The golden-path Maestro flow. Single YAML file per D-04. Signup-then-signIn-fallback
 * via `runFlow { when: { visible: { id: signIn_existingAccount } } }` per D-05.
 *
 * Stable test credentials (per D-03) — throwaway account in the dev Firebase project.
 * Not sensitive — see 06-CONTEXT §"Runtime State Inventory".
 */
function buildGoldenPathYaml(): string {
  return `# Phase 6 (VAL-01): real-Firebase e2e gate. Drives the generated SwiftUI + Firebase app
# through sign-up (first run) OR sign-in-instead (rerun) -> Firestore write -> Firestore read.
# Self-contained: no preloaded test user, no firebase-admin seeding.
appId: \${APP_ID}
env:
  EMAIL: "dtc-gate-test@appifex.dev"
  PASSWORD: "DtcGate!2026"
  DOC_TEXT: "Hello from dtc gate"
---

# Step 1 - Navigate from LoginView to SignupView.
- tapOn:
    id: "signUp_navigate"
- assertVisible:
    id: "signup_email"

# Step 2 - Fill + submit signup form (first-run path).
- tapOn:
    id: "signup_email"
- inputText: \${EMAIL}
- tapOn:
    id: "signup_password"
- inputText: \${PASSWORD}
- tapOn:
    id: "signup_confirmPassword"
- inputText: \${PASSWORD}
- tapOn:
    id: "signup_submit"

# Step 3 - Rerun fall-through: if signup failed ('email already in use'), tap the D-05
# affordance to dismiss back to LoginView, then fill + submit login form.
- runFlow:
    when:
      visible:
        id: "signIn_existingAccount"
    commands:
      - tapOn:
          id: "signIn_existingAccount"
      - tapOn:
          id: "login_email"
      - inputText: \${EMAIL}
      - tapOn:
          id: "login_password"
      - inputText: \${PASSWORD}
      - tapOn:
          id: "login_submit"

# Step 4 - Wait up to 15s for authenticated home screen (cold-simulator tolerant).
- extendedWaitUntil:
    visible:
      id: "home_root"
    timeout: 15000

# Step 5 - Navigate to writable screen, submit Firestore document.
- tapOn:
    id: "home_addItem"
- tapOn:
    id: "addItem_textField"
- inputText: \${DOC_TEXT}
- tapOn:
    id: "addItem_submit"

# Step 6 - Firestore round-trip read-back. 20s timeout absorbs first-sync snapshot latency.
- extendedWaitUntil:
    visible: \${DOC_TEXT}
    timeout: 20000
`
}

export async function runE2eGatePhase(opts: E2eGatePhaseOpts): Promise<MaestroResult> {
  const flowDir = `${opts.projectDir}/.maestro/e2e`
  const flowFile = `${flowDir}/e2e-gate.yaml`

  // Write the golden-path flow into a dedicated subdirectory (isolation from test_gen's
  // mock flows under .maestro/ root — see 06-RESEARCH §"Flow file location" rec (a)).
  await opts.runner.writeFile(flowFile, buildGoldenPathYaml())

  // Phase 6 (VAL-01 D-06): reuse runMaestro as-is; 4-min budget per 06-RESEARCH open-question #2.
  const result = await runMaestro(opts.runner, {
    projectDir: opts.projectDir,
    flowDir,
    reportDir: opts.reportDir,
    platform: opts.platform,
    appId: opts.appId,
    timeoutMs: 240_000,
  })

  if (result.failed > 0) {
    const failedNames = result.results
      .filter((r) => !r.passed)
      .map((r) => r.flowName)
      .join(', ')
    const firstError = result.results.find((r) => !r.passed)?.error
    throw new E2eGateError(
      `e2e_gate: Maestro golden-path failed (${result.failed} failed): ${failedNames}`,
      flowFile,
      firstError,
    )
  }

  return result
}
