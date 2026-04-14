import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'
import type { ValidationResult } from '@appifex/validate'
import { formatValidationSummary } from './format.js'

interface ValidationViewProps {
  results: Record<string, ValidationResult>
}

export function ValidationView({ results }: ValidationViewProps) {
  const entries = Object.entries(results)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Validation Results</Text>
      </Box>

      {entries.map(([platform, result]) => (
        <Box key={platform} flexDirection="column" marginBottom={1}>
          <Text>
            {formatValidationSummary({
              platform,
              ui: { passed: result.ui.passed, total: result.ui.total },
              unit: { passed: result.unit.passed, total: result.unit.total },
              security: result.security
                ? { passed: result.security.passed, total: result.security.total }
                : undefined,
            })}
          </Text>

          {result.ui.failed > 0 && (
            <Box flexDirection="column" marginLeft={4}>
              {result.ui.results
                .filter((r) => !r.passed)
                .map((r, i) => (
                  <Text key={i} color="red">
                    {'    '}✗ {r.flowName}: {r.error}
                  </Text>
                ))}
            </Box>
          )}

          {result.unit.failed > 0 && (
            <Box flexDirection="column" marginLeft={4}>
              {result.unit.failures.map((f, i) => (
                <Text key={i} color="red">
                  {'    '}✗ {f.testName}: {f.error}
                </Text>
              ))}
            </Box>
          )}

          {result.security && result.security.failed > 0 && (
            <Box flexDirection="column" marginLeft={4}>
              <Text color="red" bold>
                {'    '}Security ({result.security.failed} finding
                {result.security.failed !== 1 ? 's' : ''}):
              </Text>
              {result.security.findings.map((f, j) => (
                <Text key={j} color="red">
                  {'      '}✗ [{f.severity}] {f.ruleId}: {f.file}:{f.line} — {f.message}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text>
          {entries.every(([, r]) => r.allPassed)
            ? chalk.green('✅ ALL TESTS PASSING')
            : chalk.red('⛔ SOME TESTS FAILING')}
        </Text>
      </Box>
    </Box>
  )
}
