import type { PipelineReport } from './report.js'

export function formatMarkdown(report: PipelineReport): string {
  const lines: string[] = []

  lines.push(`# ${report.projectName}`)
  lines.push('')

  // Summary
  const s = report.summary
  const status = s.allGreen ? 'ALL GREEN' : s.totalTests === 0 ? 'BUILD FAILED' : `${s.totalFailed} FAILING`
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
    if (report.agent.sessionId) lines.push(`| Session ID | \`${report.agent.sessionId}\` |`)
    lines.push(`| Files Generated | ${report.agent.filesGenerated.length} |`)
    lines.push('')

    if (report.agent.filesGenerated.length > 0) {
      lines.push('### Generated Files')
      lines.push('')
      for (const f of report.agent.filesGenerated) {
        lines.push(`- \`${f}\``)
      }
      lines.push('')
    }

    if (report.agent.stopReason === 'budget_exceeded' && report.agent.sessionId) {
      lines.push(`> **Resume:** \`dtc run --resume ${report.agent.sessionId} --platform ${report.platforms[0]} --out <dir>\``)
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
      lines.push(`| Security | ${pr.securityTests.passed}/${pr.securityTests.total} | ${pr.securityTests.total} |`)
    }
    lines.push('')

    if (pr.fixResult) {
      lines.push(`**Fix:** ${pr.fixResult.status} (${pr.fixResult.attempts.length} attempt${pr.fixResult.attempts.length !== 1 ? 's' : ''}, ${pr.fixResult.totalTokensUsed.toLocaleString()} tokens)`)
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
          lines.push(`- **Attempt ${attempt.attempt}**: ${before} → ${after} (${attempt.tokensUsed.toLocaleString()} tokens, ${attempt.filesChanged.length} files changed)`)
        }
        lines.push('')
      }

      if (pr.fixResult.unresolvedFailures.length > 0) {
        lines.push('#### Unresolved Failures')
        lines.push('')
        for (const f of pr.fixResult.unresolvedFailures) {
          if ('flowName' in f) {
            lines.push(`- **UI:** ${f.flowName}: ${f.error ?? 'failed'}`)
          } else if ('suiteName' in f) {
            lines.push(`- **${f.suiteName}:** ${f.testName}: ${f.error}`)
          } else if ('failingPlatform' in f) {
            lines.push(`- **Parity:** ${f.failingPlatform}: ${f.remediation}`)
          } else {
            lines.push(`- **BaaS:** ${f.file} (${f.type}): ${f.remediation}`)
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

  return lines.join('\n')
}

export function formatJson(report: PipelineReport): string {
  return JSON.stringify(report, null, 2)
}
