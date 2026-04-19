import { spawn } from 'node:child_process'
import type { AgentRunOpts, AgentResult, AgentStopReason } from '../types.js'

/** Max stdout/stderr buffer size (10MB) — prevents OOM on long-running agents */
const MAX_BUFFER = 10 * 1024 * 1024

/** Kill the agent if no stdout activity for this many ms (5 minutes) */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000

/** Spawn an agent with plain text prompt on stdin */
export function spawnAgent(
  binary: string,
  args: string[],
  opts: AgentRunOpts,
): Promise<AgentResult> {
  return spawnAgentWithInput(binary, args, opts.prompt, opts)
}

/** Spawn an agent with a pre-formatted stream-json message on stdin */
export function spawnAgentStreamJson(
  binary: string,
  args: string[],
  jsonMessage: string,
  opts: AgentRunOpts,
): Promise<AgentResult> {
  return spawnAgentWithInput(binary, args, jsonMessage + '\n', opts)
}

interface StreamJsonState {
  sessionId?: string
  costUsd?: number
  stopReason?: AgentStopReason
  isError?: boolean
  errors?: string[]
  lastAssistantText: string
}

function spawnAgentWithInput(
  binary: string,
  args: string[],
  input: string,
  opts: AgentRunOpts,
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }

    const child = spawn(binary, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let idleTimedOut = false

    const isStreamJson = args.includes('stream-json')
    const state: StreamJsonState = { lastAssistantText: '' }

    // Idle watchdog — kill process if no stdout for IDLE_TIMEOUT_MS
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        idleTimedOut = true
        child.kill('SIGTERM')
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* already dead */
          }
        }, 5_000)
      }, IDLE_TIMEOUT_MS)
    }
    resetIdleTimer()

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (stdout.length < MAX_BUFFER) stdout += text
      opts.onOutput?.(text)
      resetIdleTimer()

      if (isStreamJson) {
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as Record<string, unknown>
            parseStreamEvent(event, state)
          } catch {
            /* not JSON */
          }
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_BUFFER) stderr += chunk.toString()
      resetIdleTimer()
    })

    // Phase 02 Plan 03 (FOUND-03): surface EPIPE via settle() helper instead of silent swallow.
    // Phase 02 Plan 04 (WR-05): order matters: register 'error' BEFORE write()
    const payloadBytes = Buffer.byteLength(input, 'utf8')
    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        settle(() =>
          resolve({
            success: false,
            output: state.lastAssistantText || stdout,
            exitCode: 1,
            error: `EpipeError: LLM CLI closed stdin before prompt fully written (site=packages/agent/adapters/base.ts, ${payloadBytes} bytes)`,
            stopReason: 'error',
            sessionId: state.sessionId,
            costUsd: state.costUsd,
          }),
        )
        return
      }
      // Phase 02 Plan 04 (WR-03): non-EPIPE stdin errors — kill child promptly to avoid runaway LLM cost
      child.kill('SIGTERM')
      settle(() =>
        resolve({
          success: false,
          output: state.lastAssistantText || stdout,
          exitCode: 1,
          error: `stdin error: ${err.message}`,
          stopReason: 'error',
          sessionId: state.sessionId,
          costUsd: state.costUsd,
        }),
      )
    })

    child.stdin.write(input)
    child.stdin.end()

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGTERM')
          // Escalate to SIGKILL after 5s if process doesn't exit
          setTimeout(() => {
            try {
              child.kill('SIGKILL')
            } catch {
              /* already dead */
            }
          }, 5_000)
        }, opts.timeoutMs)
      : undefined

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (idleTimer) clearTimeout(idleTimer)

      if (timedOut) {
        settle(() =>
          resolve({
            success: false,
            output: isStreamJson ? state.lastAssistantText : stdout,
            exitCode: code ?? 1,
            error: `Agent timed out after ${Math.round((opts.timeoutMs ?? 0) / 60_000)} minutes.`,
            stopReason: 'timeout',
            sessionId: state.sessionId,
            costUsd: state.costUsd,
          }),
        )
        return
      }

      if (idleTimedOut) {
        // Agent stopped producing output — likely stuck after budget exhaustion
        const reason = state.stopReason ?? 'budget_exceeded'
        settle(() =>
          resolve({
            success: false,
            output: isStreamJson ? state.lastAssistantText : stdout,
            exitCode: code ?? 1,
            error: `Agent idle for ${Math.round(IDLE_TIMEOUT_MS / 60_000)} minutes with no output — killed. Likely ran out of budget.`,
            stopReason: reason,
            sessionId: state.sessionId,
            costUsd: state.costUsd,
          }),
        )
        return
      }

      if (isStreamJson) {
        const stopReason = state.stopReason ?? (state.isError ? 'error' : 'success')
        const success = stopReason === 'success'
        settle(() =>
          resolve({
            success,
            output: state.lastAssistantText || stdout,
            exitCode: code ?? (success ? 0 : 1),
            error: !success
              ? state.errors?.join('; ') || `Agent exited with code ${code}`
              : undefined,
            stopReason,
            sessionId: state.sessionId,
            costUsd: state.costUsd,
          }),
        )
        return
      }

      settle(() =>
        resolve({
          success: code === 0,
          output: stdout,
          exitCode: code ?? 1,
          error:
            code !== 0
              ? stderr.slice(-2000) || stdout.slice(-2000) || `Agent exited with code ${code}`
              : undefined,
          stopReason: code === 0 ? 'success' : 'error',
        }),
      )
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      if (idleTimer) clearTimeout(idleTimer)
      settle(() => reject(err))
    })
  })
}

function parseStreamEvent(event: Record<string, unknown>, state: StreamJsonState): void {
  if (event.type === 'system' && event.subtype === 'init') {
    state.sessionId = event.session_id as string | undefined
  }

  if (event.type === 'assistant') {
    const msg = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
    if (msg?.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          state.lastAssistantText = block.text
        }
      }
    }
  }

  if (event.type === 'result') {
    state.isError = event.is_error === true
    state.errors = Array.isArray(event.errors) ? (event.errors as string[]) : undefined
    state.costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined

    const subtype = event.subtype as string | undefined
    if (subtype === 'error_max_budget_usd') {
      state.stopReason = 'budget_exceeded'
    } else if (state.isError) {
      state.stopReason = 'error'
    } else {
      state.stopReason = 'success'
    }
  }
}
