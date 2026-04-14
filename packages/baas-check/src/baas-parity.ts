import type {
  BaasIntegrationResult,
  BaasIntegrationViolation,
  BaasParityResult,
  BaasViolationType,
  ParityViolation,
  Platform,
} from '@appifex/core'

export function checkBaasParity(result: BaasIntegrationResult): BaasParityResult {
  const platforms = result.platformsScanned ?? []

  // D-04: Single-platform or no-platform early exit
  if (platforms.length <= 1) {
    return { allPassed: true, violations: [], platformsCompared: platforms }
  }

  // Group violations by platform
  const violationsByPlatform = new Map<Platform, BaasIntegrationViolation[]>()
  for (const platform of platforms) {
    violationsByPlatform.set(platform, [])
  }
  for (const v of result.violations) {
    const existing = violationsByPlatform.get(v.platform)
    if (existing) {
      existing.push(v)
    }
  }

  // D-07: Parity mismatch = one platform zero violations, another has violations
  // D-08: Any violation type counts as failing
  const parityViolations: ParityViolation[] = []
  for (const [platformA, violationsA] of violationsByPlatform) {
    for (const [platformB, violationsB] of violationsByPlatform) {
      if (platformA === platformB) continue
      if (violationsA.length === 0 && violationsB.length > 0) {
        parityViolations.push({
          passingPlatform: platformA,
          failingPlatform: platformB,
          failingViolationTypes: [
            ...new Set(violationsB.map((v) => v.type)),
          ] as BaasViolationType[],
          remediation: `Platform ${platformB} has integration violations while ${platformA} passes. Fix ${platformB} to use real Firebase Auth.`,
        })
      }
    }
  }

  return {
    allPassed: parityViolations.length === 0,
    violations: parityViolations,
    platformsCompared: platforms,
  }
}
