import type { Runner, Platform, SemgrepResult, BaasContext, BaasIntegrationResult, BaasParityResult, MockCheckResult, MockParityResult, MockCheckContext } from '@appifex/core'
import { checkBaasIntegration, checkBaasParity } from '@appifex/baas-check'
import { checkMockLayer, checkMockParity } from '@appifex/mock-check'
import { runMaestro, type MaestroResult } from './maestro.js'
import { runUnitTests, type UnitTestResult } from './unit-tests.js'
import { runSemgrep } from './semgrep.js'

export interface ValidateAllOpts {
  platform: Platform
  projectDir: string
  flowDir: string
  testDir: string
  reportDir: string
  scheme?: string
  runSecurity?: boolean
  baasContext?: BaasContext
  mockContext?: MockCheckContext
}

export interface ValidationResult {
  ui: MaestroResult
  unit: UnitTestResult
  security?: SemgrepResult
  baasIntegration?: BaasIntegrationResult
  baasParity?: BaasParityResult
  mockLayer?: MockCheckResult
  mockParity?: MockParityResult
  allPassed: boolean
}

export async function validateAll(runner: Runner, opts: ValidateAllOpts): Promise<ValidationResult> {
  const ui = await runMaestro(runner, {
    flowDir: opts.flowDir,
    projectDir: opts.projectDir,
    reportDir: opts.reportDir,
    platform: opts.platform,
  })

  const unit = await runUnitTests(runner, {
    platform: opts.platform,
    projectDir: opts.projectDir,
    testDir: opts.testDir,
    scheme: opts.scheme,
  })

  const baseTestsPassed = ui.failed === 0 && unit.failed === 0

  let security: SemgrepResult | undefined
  if (opts.runSecurity && baseTestsPassed) {
    security = await runSemgrep(runner, { projectDir: opts.projectDir, platform: opts.platform })
  }

  const securityPassed = !security || security.failed === 0

  let baasIntegration: BaasIntegrationResult | undefined
  let baasParity: BaasParityResult | undefined
  if (opts.baasContext) {
    baasIntegration = await checkBaasIntegration(runner, opts.projectDir, opts.baasContext)
    baasParity = checkBaasParity(baasIntegration)
  }

  let mockLayer: MockCheckResult | undefined
  let mockParity: MockParityResult | undefined
  if (opts.mockContext) {
    mockLayer = await checkMockLayer(runner, opts.projectDir, opts.mockContext)
    mockParity = checkMockParity(mockLayer)
  }

  return {
    ui,
    unit,
    security,
    baasIntegration,
    baasParity,
    mockLayer,
    mockParity,
    allPassed:
      baseTestsPassed &&
      securityPassed &&
      (baasIntegration?.allPassed ?? true) &&
      (baasParity?.allPassed ?? true) &&
      (mockLayer?.allPassed ?? true) &&
      (mockParity?.allPassed ?? true),
  }
}
