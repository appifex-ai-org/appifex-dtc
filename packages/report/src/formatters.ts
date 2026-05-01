import type { PipelineReport } from './report.js'

// Phase 7 (OBS-02 D-15): remediation hints per failure class
const REMEDIATION_HINTS: Record<string, string> = {
  maestro: 'Check device/simulator state and Maestro logs under .dtc-debug/maestro/.',
  unit: 'Run the failing test locally via `pnpm vitest run <path>` for interactive debugging.',
  'security-lint': 'Review generated security.rules for cross-user reads; see 04-CONTEXT FIRE-05.',
  semgrep: 'Review semgrep findings in .dtc-debug/semgrep/. Hard-fail cannot be bypassed.',
  parity:
    'A design adapter produced IR that does not match the Pencil-authoritative fixture. Re-run fixture-gen.ts if the reference design changed.',
  baas: 'Check ~/.dtc/config.json firebase.projectId + serviceAccountKeyPath. Run `dtc doctor --deep`.',
}

export function formatMarkdown(report: PipelineReport): string {
  const lines: string[] = []

  lines.push(`# ${report.projectName}`)
  lines.push('')

  // Summary
  const s = report.summary
  const status = s.allGreen
    ? 'ALL GREEN'
    : s.totalTests === 0
      ? 'BUILD FAILED'
      : `${s.totalFailed} FAILING`
  lines.push(`**Status:** ${status}`)
  lines.push(`**Tests:** ${s.totalPassed}/${s.totalTests}`)
  lines.push(`**Design iterations:** ${s.designIterations}`)
  lines.push(`**Fix attempts:** ${s.fixAttempts}`)
  lines.push(`**Duration:** ${(s.totalDuration / 1000).toFixed(1)}s`)
  lines.push('')

  // Agent details
  if (report.agent) {
    lines.push('## Agent Session')
    lines.push('')
    lines.push(`| Field | Value |`)
    lines.push(`|-------|-------|`)
    lines.push(`| Agent | ${report.agent.agentName} |`)
    if (report.agent.model) lines.push(`| Model | ${report.agent.model} |`)
    lines.push(`| Stop Reason | ${report.agent.stopReason} |`)
    if (report.agent.costUsd != null) lines.push(`| Cost | $${report.agent.costUsd.toFixed(4)} |`)
    else if (report.agent.costUnknown)
      lines.push('| Cost | unknown (local CLI did not report usage) |')
    if (report.agent.sessionId) lines.push(`| Session ID | \`${report.agent.sessionId}\` |`)
    // Phase 7 (WR-03): guard against missing filesGenerated (e.g. deserialized from older checkpoint)
    const filesGenerated = report.agent.filesGenerated ?? []
    lines.push(`| Files Generated | ${filesGenerated.length} |`)
    lines.push('')

    if (filesGenerated.length > 0) {
      lines.push('### Generated Files')
      lines.push('')
      for (const f of filesGenerated) {
        lines.push(`- \`${f}\``)
      }
      lines.push('')
    }

    if (report.agent.stopReason === 'budget_exceeded' && report.agent.sessionId) {
      lines.push(
        `> **Resume:** \`dtc run --resume ${report.agent.sessionId} --platform ${report.platforms[0]} --out <dir>\``,
      )
      lines.push('')
    }

    if (report.agent.output) {
      lines.push('### Agent Output')
      lines.push('')
      lines.push(report.agent.output.slice(0, 2000))
      lines.push('')
    }
  }

  // Per-platform
  lines.push('## Platform Results')
  lines.push('')

  for (const pr of report.platformReports) {
    lines.push(`### ${pr.platform}`)
    lines.push('')
    lines.push(`| Type | Passed | Total |`)
    lines.push(`|------|--------|-------|`)
    lines.push(`| UI   | ${pr.uiTests.passed}/${pr.uiTests.total} | ${pr.uiTests.total} |`)
    lines.push(`| Unit | ${pr.unitTests.passed}/${pr.unitTests.total} | ${pr.unitTests.total} |`)
    if (pr.securityTests) {
      lines.push(
        `| Security | ${pr.securityTests.passed}/${pr.securityTests.total} | ${pr.securityTests.total} |`,
      )
    }
    lines.push('')

    // Phase 7 (OBS-02 D-15): emit remediation hints for failing tests even when no fixResult
    const hasUiFail = pr.uiTests.passed < pr.uiTests.total
    const hasUnitFail = pr.unitTests.passed < pr.unitTests.total
    const hasSecFail = pr.securityTests && pr.securityTests.passed < pr.securityTests.total
    if (!pr.fixResult && (hasUiFail || hasUnitFail || hasSecFail)) {
      if (hasUiFail) {
        lines.push(`**Remediation:** ${REMEDIATION_HINTS['maestro']}`)
        lines.push('')
      }
      if (hasUnitFail) {
        lines.push(`**Remediation:** ${REMEDIATION_HINTS['unit']}`)
        lines.push('')
      }
      if (hasSecFail) {
        lines.push(`**Remediation:** ${REMEDIATION_HINTS['security-lint']}`)
        lines.push('')
      }
    }

    if (pr.fixResult) {
      lines.push(
        `**Fix:** ${pr.fixResult.status} (${pr.fixResult.attempts.length} attempt${pr.fixResult.attempts.length !== 1 ? 's' : ''}, ${pr.fixResult.totalTokensUsed.toLocaleString()} tokens)`,
      )
      if (pr.fixResult.circuitBreakReason) {
        lines.push(`**Stopped:** ${pr.fixResult.circuitBreakReason}`)
      }
      if (pr.fixResult.recommendation) {
        lines.push(`**Recommendation:** ${pr.fixResult.recommendation}`)
      }
      lines.push('')

      if (pr.fixResult.attempts.length > 0) {
        lines.push('#### Fix Attempts')
        lines.push('')
        for (const attempt of pr.fixResult.attempts) {
          const before = `${attempt.testsBefore.passed}/${attempt.testsBefore.total}`
          const after = `${attempt.testsAfter.passed}/${attempt.testsAfter.total}`
          lines.push(
            `- **Attempt ${attempt.attempt}**: ${before} → ${after} (${attempt.tokensUsed.toLocaleString()} tokens, ${attempt.filesChanged.length} files changed)`,
          )
          if (attempt.filesChanged.length > 0) {
            const shown = attempt.filesChanged.slice(0, 8).map((f) => `\`${f}\``)
            const more =
              attempt.filesChanged.length > shown.length
                ? `, +${attempt.filesChanged.length - shown.length} more`
                : ''
            lines.push(`  Changed: ${shown.join(', ')}${more}`)
          }
        }
        lines.push('')
      }

      if (pr.fixResult.unresolvedFailures.length > 0) {
        lines.push('#### Unresolved Failures')
        lines.push('')
        for (const f of pr.fixResult.unresolvedFailures) {
          let failureClass: string | undefined
          if ('flowName' in f) {
            lines.push(`- **UI:** ${f.flowName}: ${f.error ?? 'failed'}`)
            failureClass = 'maestro'
          } else if ('suiteName' in f) {
            lines.push(`- **${f.suiteName}:** ${f.testName}: ${f.error}`)
            failureClass = 'unit'
          } else if ('failingPlatform' in f) {
            lines.push(`- **Parity:** ${f.failingPlatform}: ${f.remediation}`)
            failureClass = 'parity'
          } else {
            lines.push(`- **BaaS:** ${f.file} (${f.type}): ${f.remediation}`)
            failureClass = 'baas'
          }
          // Phase 7 (OBS-02 D-15): remediation hint for this failure class
          const hint = failureClass ? REMEDIATION_HINTS[failureClass] : undefined
          if (hint) {
            lines.push('')
            lines.push(`  **Remediation:** ${hint}`)
          }
        }
        lines.push('')
      }
    }
  }

  // Token usage
  const usage = Object.entries(report.tokenUsage).filter(([, v]) => v && v > 0)
  if (usage.length > 0) {
    lines.push('## Token Usage')
    lines.push('')
    lines.push('| Phase | Tokens |')
    lines.push('|-------|--------|')
    for (const [phase, tokens] of usage) {
      lines.push(`| ${phase} | ${tokens!.toLocaleString()} |`)
    }
    lines.push('')
  }

  // Phase 7 (OBS-01 D-15): Cost Estimate section
  const hasCost =
    report.costUsdPerPhase != null ||
    report.costUsdTotal != null ||
    report.pricingAsOf != null ||
    report.costNote != null
  if (hasCost) {
    lines.push('## Cost Estimate')
    lines.push('')
    if (report.model) lines.push(`**Model:** ${report.model}`)
    if (report.pricingAsOf) lines.push(`**Prices as of:** ${report.pricingAsOf}`)
    if (report.costNote) lines.push(`**Cost:** ${report.costNote}`)
    lines.push('')
    if (report.costUsdPerPhase) {
      lines.push('| Phase | Tokens (in/out) | USD |')
      lines.push('|-------|-----------------|-----|')
      const breakdown = report.tokenUsageBreakdown ?? {}
      const costs = report.costUsdPerPhase
      for (const phase of Object.keys(costs)) {
        const bd = breakdown[phase as keyof typeof breakdown] ?? { input: 0, output: 0 }
        const c = costs[phase as keyof typeof costs]
        const usd = c == null ? '—' : `$${c.toFixed(2)}`
        lines.push(
          `| ${phase} | ${bd.input.toLocaleString()} / ${bd.output.toLocaleString()} | ${usd} |`,
        )
      }
      lines.push('')
    }
    if (report.costUsdTotal != null) {
      lines.push(`**Total:** $${report.costUsdTotal.toFixed(2)}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function formatJson(report: PipelineReport): string {
  return JSON.stringify(report, null, 2)
}
