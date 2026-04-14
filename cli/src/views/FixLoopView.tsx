import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import chalk from 'chalk'
import type { FixResult, FixAttempt } from '@appifex/core'
import { formatFixStatus } from './format.js'

interface FixLoopViewProps {
  platform: string
  currentAttempt?: number
  maxAttempts: number
  attempts: FixAttempt[]
  result?: FixResult
  isRunning: boolean
}

export function FixLoopView({
  platform,
  currentAttempt,
  maxAttempts,
  attempts,
  result,
  isRunning,
}: FixLoopViewProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Fix Loop — {platform}</Text>
      </Box>

      {isRunning && currentAttempt && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            Attempt {currentAttempt}/{maxAttempts}
          </Text>
        </Box>
      )}

      {attempts.map((attempt, i) => (
        <Box key={i} flexDirection="column" marginLeft={2}>
          <Text>
            {chalk.dim(`#${attempt.attempt}`)}{' '}
            {attempt.testsAfter.passed > attempt.testsBefore.passed
              ? chalk.green(
                  `+${attempt.testsAfter.passed - attempt.testsBefore.passed} tests fixed`,
                )
              : attempt.testsAfter.passed === attempt.testsBefore.passed
                ? chalk.yellow('no change')
                : chalk.red(
                    `-${attempt.testsBefore.passed - attempt.testsAfter.passed} regression`,
                  )}{' '}
            {chalk.dim(`(${attempt.tokensUsed.toLocaleString()} tokens)`)}
          </Text>
          <Text dimColor>
            {'   '}Before: {attempt.testsBefore.passed}/{attempt.testsBefore.total}
            {'  →  '}After: {attempt.testsAfter.passed}/{attempt.testsAfter.total}
            {'  '}Files: {attempt.filesChanged.join(', ')}
          </Text>
        </Box>
      ))}

      {result && (
        <Box marginTop={1}>
          <Text>
            {formatFixStatus({
              status: result.status,
              attempts: result.attempts.length,
              tokensUsed: result.totalTokensUsed,
              recommendation: result.recommendation,
            })}
          </Text>
        </Box>
      )}
    </Box>
  )
}
