import type { FixResult, FixAttempt, FixRecommendation, CircuitBreakReason } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

interface BuildResult {
  success: boolean
  error?: string
  duration: number
}

export interface FixFnResult {
  filesChanged: string[]
  tokensUsed: number
}

export interface FixLoopOpts {
  fixFn: (failures: ValidationResult) => Promise<FixFnResult>
  buildFn: () => Promise<BuildResult>
  validateFn: () => Promise<ValidationResult>
  maxAttempts: number
  tokenBudget: number
  timeoutMs?: number
  /** Disable all circuit breakers (benchmark mode) */
  disableCircuitBreakers?: boolean
}

function totalPassing(v: ValidationResult): number {
  return v.ui.passed + v.unit.passed
}

function totalTests(v: ValidationResult): number {
  return v.ui.total + v.unit.total
}

function errorSignature(v: ValidationResult): string {
  const uiErrors = v.ui.results
    .filter((r) => !r.passed)
    .map((r) => r.error ?? r.flowName)
    .sort()
  const unitErrors = v.unit.failures.map((f) => f.error).sort()
  const secErrors = (v.security?.findings ?? [])
    .map((f) => `${f.ruleId}:${f.file}:${f.line}`)
    .sort()
  return JSON.stringify([...uiErrors, ...unitErrors, ...secErrors])
}

function chooseRecommendation(
  reason: CircuitBreakReason,
  lastValidation: ValidationResult,
): FixRecommendation {
  const passRate = totalPassing(lastValidation) / Math.max(totalTests(lastValidation), 1)

  if (reason === 'budget_exceeded') return 'add_budget'
  if (reason === 'regression') return 'simplify_design'
  if (passRate > 0.8) return 'relax_tests'
  if (passRate > 0.5) return 'split_and_retry'
  return 'manual_fix'
}

export async function fixLoop(
  initialFailure: ValidationResult,
  opts: FixLoopOpts,
): Promise<FixResult> {
  const attempts: FixAttempt[] = []
  let totalTokensUsed = 0
  let lastValidation = initialFailure
  let lastErrorSig = errorSignature(initialFailure)
  let sameErrorCount = 0
  let noProgressCount = 0
  let lastPassCount = totalPassing(initialFailure)
  let lastBuildError = ''
  let sameBuildErrorCount = 0
  const startTime = Date.now()

  const fail = (reason: CircuitBreakReason, rollback: boolean): FixResult => ({
    status:
      reason === 'budget_exceeded' ? 'budget_exceeded' : reason === 'timeout' ? 'timeout' : 'stuck',
    attempts,
    unresolvedFailures: [
      ...lastValidation.ui.results.filter((r) => !r.passed),
      ...lastValidation.unit.failures,
      ...(lastValidation.baasIntegration?.violations ?? []),
      ...(lastValidation.baasParity?.violations ?? []),
    ],
    rollbackApplied: rollback,
    recommendation: chooseRecommendation(reason, lastValidation),
    circuitBreakReason: reason,
    totalTokensUsed,
    totalDuration: Date.now() - startTime,
  })

  for (let i = 0; i < opts.maxAttempts; i++) {
    // Check timeout (skip in benchmark mode)
    if (!opts.disableCircuitBreakers && opts.timeoutMs && Date.now() - startTime > opts.timeoutMs) {
      return fail('timeout', false)
    }

    // Apply fix
    const fix = await opts.fixFn(lastValidation)
    totalTokensUsed += fix.tokensUsed

    // Check budget (skip in benchmark mode)
    if (!opts.disableCircuitBreakers && totalTokensUsed > opts.tokenBudget) {
      attempts.push({
        attempt: i + 1,
        model: 'default',
        filesChanged: fix.filesChanged,
        testsBefore: { passed: lastPassCount, total: totalTests(lastValidation) },
        testsAfter: { passed: lastPassCount, total: totalTests(lastValidation) },
        tokensUsed: fix.tokensUsed,
        duration: Date.now() - startTime,
      })
      return fail('budget_exceeded', false)
    }

    // Build
    const build = await opts.buildFn()
    if (!build.success) {
      // Check if build error is the same as last time
      const buildErrorSig = build.error ?? 'build failed'
      if (buildErrorSig === lastBuildError) {
        sameBuildErrorCount++
        if (!opts.disableCircuitBreakers && sameBuildErrorCount >= 2) {
          attempts.push({
            attempt: i + 1,
            model: 'default',
            filesChanged: fix.filesChanged,
            testsBefore: { passed: lastPassCount, total: totalTests(lastValidation) },
            testsAfter: { passed: 0, total: totalTests(lastValidation) },
            tokensUsed: fix.tokensUsed,
            duration: Date.now() - startTime,
          })
          return fail('same_error_repeated', false)
        }
      } else {
        sameBuildErrorCount = 1
      }
      lastBuildError = buildErrorSig

      attempts.push({
        attempt: i + 1,
        model: 'default',
        filesChanged: fix.filesChanged,
        testsBefore: { passed: lastPassCount, total: totalTests(lastValidation) },
        testsAfter: { passed: 0, total: totalTests(lastValidation) },
        tokensUsed: fix.tokensUsed,
        duration: Date.now() - startTime,
      })
      continue
    }

    // Validate
    const validation = await opts.validateFn()
    const currentPassCount = totalPassing(validation)

    attempts.push({
      attempt: i + 1,
      model: 'default',
      filesChanged: fix.filesChanged,
      testsBefore: { passed: lastPassCount, total: totalTests(lastValidation) },
      testsAfter: { passed: currentPassCount, total: totalTests(validation) },
      tokensUsed: fix.tokensUsed,
      duration: Date.now() - startTime,
    })

    // All green?
    if (validation.allPassed) {
      return {
        status: 'all_green',
        attempts,
        unresolvedFailures: [],
        rollbackApplied: false,
        totalTokensUsed,
        totalDuration: Date.now() - startTime,
      }
    }

    // Regression check — fix made things worse (skip in benchmark mode)
    if (!opts.disableCircuitBreakers && currentPassCount < lastPassCount) {
      return fail('regression', true)
    }

    // Same error repeated? (check before no_progress — stronger signal)
    const currentErrorSig = errorSignature(validation)
    const errorsChanged = currentErrorSig !== lastErrorSig
    if (!errorsChanged) {
      sameErrorCount++
      if (!opts.disableCircuitBreakers && sameErrorCount >= 3) {
        return fail('same_error_repeated', false)
      }
    } else {
      sameErrorCount = 1
    }
    lastErrorSig = currentErrorSig

    // No progress? (same pass count but different errors — going in circles)
    // Only count no_progress when errors actually changed (otherwise same_error_repeated handles it)
    if (currentPassCount === lastPassCount && errorsChanged) {
      noProgressCount++
      if (!opts.disableCircuitBreakers && noProgressCount >= 2) {
        return fail('no_progress', false)
      }
    } else if (currentPassCount > lastPassCount) {
      noProgressCount = 0
    }

    lastPassCount = currentPassCount
    lastValidation = validation
  }

  return fail('max_attempts', false)
}
