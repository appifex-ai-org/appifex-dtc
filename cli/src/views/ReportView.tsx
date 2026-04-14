import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'
import type { PipelineReport } from '@appifex/report'

interface ReportViewProps {
  report: PipelineReport
}

export function ReportView({ report }: ReportViewProps) {
  const s = report.summary

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>
          {s.allGreen ? chalk.green('✅') : chalk.red('⛔')} {report.projectName} —{' '}
          {s.allGreen ? 'Complete' : 'Issues Found'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {report.platformReports.map((pr) => (
          <Box key={pr.platform}>
            <Text>
              {'  '}
              {pr.platform.padEnd(16)}
              {chalk.dim('UI')} {pr.uiTests.passed}/{pr.uiTests.total}
              {'  '}
              {chalk.dim('Unit')} {pr.unitTests.passed}/{pr.unitTests.total}
              {pr.fixResult
                ? `  ${chalk.dim('Fix')} ${pr.fixResult.attempts.length} attempt${pr.fixResult.attempts.length !== 1 ? 's' : ''}`
                : ''}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text dimColor>
          {' '}
          Tests: {s.totalPassed}/{s.totalTests} Tokens: {s.totalTokens.toLocaleString()} Design:{' '}
          {s.designIterations} iteration{s.designIterations !== 1 ? 's' : ''} Fix: {s.fixAttempts}{' '}
          attempt{s.fixAttempts !== 1 ? 's' : ''} Duration: {(s.totalDuration / 1000).toFixed(1)}s
        </Text>
      </Box>
    </Box>
  )
}
