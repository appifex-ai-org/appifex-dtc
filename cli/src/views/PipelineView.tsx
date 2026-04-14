import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import chalk from 'chalk'
import type { ProgressEvent, PhaseId, FixStatus } from '@appifex/core'
import {
  formatPhaseStatus,
  formatTokenBar,
  formatValidationSummary,
  formatFixStatus,
  type PhaseState,
  type PhaseDisplayStatus,
  type ValidationSummaryInput,
  type FixStatusInput,
} from './format.js'

export const PIPELINE_PHASES: PhaseId[] = [
  'design',
  'spec',
  'design_delta',
  'baas_recommend',
  'baas_schema',
  'baas_auth',
  'mock_service',
  'test_gen',
  'codegen',
  'test_regen',
  'build',
  'validate',
  'security',
  'fix',
  'deliver',
  'report',
]

interface PipelineViewProps {
  projectName: string
  onEvent?: (handler: (event: ProgressEvent) => void) => void
  tokenBudget?: number
}

export function PipelineView({ projectName, onEvent, tokenBudget = 100_000 }: PipelineViewProps) {
  const [phases, setPhases] = useState<Map<string, PhaseState>>(() => {
    const map = new Map<string, PhaseState>()
    for (const id of PIPELINE_PHASES) {
      map.set(id, { id, status: 'pending' })
    }
    return map
  })
  const [tokensUsed, setTokensUsed] = useState(0)
  const [validations, setValidations] = useState<ValidationSummaryInput[]>([])
  const [fixResult, setFixResult] = useState<FixStatusInput | null>(null)
  const [isRunning, setIsRunning] = useState(true)

  useEffect(() => {
    if (!onEvent) return
    onEvent((event: ProgressEvent) => {
      setPhases((prev) => {
        const next = new Map(prev)
        const status: PhaseDisplayStatus =
          event.status === 'started' || event.status === 'running'
            ? 'running'
            : event.status === 'completed'
              ? 'completed'
              : event.status === 'failed'
                ? 'failed'
                : event.status === 'skipped'
                  ? 'skipped'
                  : 'pending'

        next.set(event.phase, {
          id: event.phase,
          status,
          message: event.message,
        })
        return next
      })

      if (event.tokensUsed) {
        setTokensUsed((prev) => prev + event.tokensUsed!)
      }

      // Update validation summaries when validate phase reports results
      if (event.phase === 'validate' && event.status === 'completed' && event.message) {
        const match = event.message.match(/UI (\d+)\/(\d+)\s+Unit (\d+)\/(\d+)/)
        if (match) {
          setValidations((prev) => [
            ...prev,
            {
              platform: 'default',
              ui: { passed: parseInt(match[1]), total: parseInt(match[2]) },
              unit: { passed: parseInt(match[3]), total: parseInt(match[4]) },
            },
          ])
        }
      }

      // Update fix result when fix phase completes
      if (event.phase === 'fix' && (event.status === 'completed' || event.status === 'failed')) {
        const match = event.message?.match(/(\w+) — (\d+) attempts?/)
        setFixResult({
          status: (match?.[1] ?? event.status) as FixStatus,
          attempts: parseInt(match?.[2] ?? '0'),
          tokensUsed: event.tokensUsed ?? 0,
        })
      }

      // Check for pipeline completion
      if (event.phase === 'report' && (event.status === 'completed' || event.status === 'failed')) {
        setIsRunning(false)
      }
    })
  }, [onEvent])

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text>
          {isRunning ? (
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
          ) : (
            <Text color="green">✓</Text>
          )}{' '}
          <Text bold>{projectName}</Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        {PIPELINE_PHASES.map((id) => {
          const phase = phases.get(id) ?? { id, status: 'pending' as const }
          return <Text key={id}>{formatPhaseStatus(phase)}</Text>
        })}
      </Box>

      {validations.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {validations.map((v) => (
            <Text key={v.platform}>{formatValidationSummary(v)}</Text>
          ))}
        </Box>
      )}

      {fixResult && (
        <Box marginTop={1}>
          <Text>{formatFixStatus(fixResult)}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text>{formatTokenBar(tokensUsed, tokenBudget)}</Text>
      </Box>
    </Box>
  )
}
