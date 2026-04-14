import { ProgressEmitter, type RunMode, type AgentConfigType, type Platform } from '@appifex/core'
import type { PipelineOpts, PipelineResult } from '@appifex/cli'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isPromptVague } from './refine.js'

type RunPipelineFn = (opts: PipelineOpts, progress: ProgressEmitter) => Promise<PipelineResult>

export async function handleRunPipeline(
  args: {
    prompt: string
    platform: string
    outputDir: string
    designFile?: string
    mode?: string
    agentType?: string
    resumeSessionId?: string
    verbose?: boolean
    benchmark?: boolean
    configDir?: string
    baasProvider?: string
  },
  /** Injectable for testing — defaults to the real runPipeline via dynamic import */
  runPipelineOverride?: RunPipelineFn,
  /** Optional callback to stream progress messages (e.g. MCP logging) */
  sendLog?: (message: string) => void,
): Promise<{ text: string; isError: boolean }> {
  try {
    // Guard: reject vague prompts — the caller should use dtc_refine_prompt first
    if (isPromptVague(args.prompt, args.platform)) {
      return {
        text: JSON.stringify({
          status: 'needs_refinement',
          error: 'Prompt is too vague to run the pipeline. Call dtc_refine_prompt in "ask" mode first to gather requirements from the user, then call it again in "enrich" mode with their answers, and finally pass the enriched prompt to dtc_run_pipeline.',
          prompt: args.prompt,
        }, null, 2),
        isError: true,
      }
    }
    const runPipeline: RunPipelineFn = runPipelineOverride
      ?? (await import('@appifex/cli')).runPipeline as unknown as RunPipelineFn

    const progress = new ProgressEmitter()
    const events: string[] = []
    progress.on((event) => {
      const line = `[${event.phase}] ${event.status}: ${event.message}`
      events.push(line)
      sendLog?.(line)
    })

    const result = await runPipeline({
      prompt: args.prompt,
      platform: args.platform as Platform,
      outputDir: args.outputDir,
      designFile: args.designFile,
      configDir: args.configDir ?? join(homedir(), '.dtc'),
      interactive: false,
      verbose: args.verbose ?? false,
      benchmark: args.benchmark ?? false,
      agentType: args.agentType as AgentConfigType | undefined,
      resumeSessionId: args.resumeSessionId,
      runMode: args.mode as RunMode | undefined,
      baasProvider: args.baasProvider as import('@appifex/core').BaasProvider | undefined,
    }, progress)

    return {
      text: JSON.stringify({
        status: 'completed',
        summary: result.report.summary,
        markdown: result.markdown,
        deliver: result.deliver,
        events,
      }, null, 2),
      isError: !(result.report.summary.allGreen === true),
    }
  } catch (err) {
    // Load persisted context to surface checkpoint data (per D-01)
    let checkpointData: import('@appifex/core').CheckpointInfo = {
      run_id: null,
      completed_phases: [],
      agent_session_id: null,
      failed_phase: null,
      token_usage: null,
      output_dir: args.outputDir,
    }

    try {
      const { loadRunContext } = await import('@appifex/core')
      const ctx = await loadRunContext(args.outputDir)
      if (ctx) {
        const completedPhases = (Object.entries(ctx.phases) as [import('@appifex/core').PhaseId, import('@appifex/core').PhaseOutcome][])
          .filter(([, outcome]) => outcome.status === 'completed')
          .map(([phaseId]) => phaseId)
        const failedEntry = (Object.entries(ctx.phases) as [import('@appifex/core').PhaseId, import('@appifex/core').PhaseOutcome][])
          .find(([, outcome]) => outcome.status === 'failed')
        checkpointData = {
          run_id: ctx.runId,
          completed_phases: completedPhases,
          agent_session_id: ctx.agentSessionId ?? null,
          failed_phase: failedEntry ? failedEntry[0] : null,
          token_usage: null,
          output_dir: args.outputDir,
        }
      }
    } catch { /* loading context must not mask the original error */ }

    const resumable = checkpointData.completed_phases.length > 0

    return {
      text: JSON.stringify({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        resumable,
        checkpoint: checkpointData,
        ...(resumable && {
          resume: {
            tool: 'dtc_run_pipeline',
            args: {
              mode: 'resume',
              outputDir: args.outputDir,
              resumeSessionId: checkpointData.agent_session_id ?? undefined,
            },
          },
        }),
      }, null, 2),
      isError: true,
    }
  }
}
