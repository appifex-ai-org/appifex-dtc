import type {
  MockCheckResult,
  MockLayerViolation,
  MockParityResult,
  MockParityViolation,
  MockViolationType,
  Platform,
} from '@appifex/core'

export function checkMockParity(result: MockCheckResult): MockParityResult {
  const platforms = result.platformsScanned

  // Single-platform or no-platform early exit — parity N/A
  if (platforms.length <= 1) {
    return { allPassed: true, violations: [], platformsCompared: platforms }
  }

  // Group violations by platform
  const violationsByPlatform = new Map<Platform, MockLayerViolation[]>()
  for (const platform of platforms) {
    violationsByPlatform.set(platform, [])
  }
  for (const v of result.violations) {
    const existing = violationsByPlatform.get(v.platform)
    if (existing) existing.push(v)
  }

  // Asymmetry detection: one platform clean, another has violations
  const parityViolations: MockParityViolation[] = []
  for (const [platformA, violationsA] of violationsByPlatform) {
    for (const [platformB, violationsB] of violationsByPlatform) {
      if (platformA === platformB) continue
      if (violationsA.length === 0 && violationsB.length > 0) {
        parityViolations.push({
          passingPlatform: platformA,
          failingPlatform: platformB,
          failingViolationTypes: [
            ...new Set(violationsB.map((v) => v.type)),
          ] as MockViolationType[],
          remediation: `Platform ${platformB} has mock layer violations while ${platformA} passes. Fix ${platformB} mock layer.`,
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
