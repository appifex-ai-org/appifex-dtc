import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
    const isJsonEvents = args.includes('--json')
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

      if (isStreamJson || isJsonEvents) {
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as Record<string, unknown>
            if (isStreamJson) parseStreamEvent(event, state)
            else parseJsonEvent(event, state)
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
            output: finalOutput(opts, state, stdout, isStreamJson || isJsonEvents),
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
            output: finalOutput(opts, state, stdout, isStreamJson || isJsonEvents),
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

      const stopReason =
        code === 0 ? (state.stopReason ?? (state.isError ? 'error' : 'success')) : 'error'
      const success = code === 0 && stopReason === 'success'
      settle(() =>
        resolve({
          success,
          output: finalOutput(opts, state, stdout, isJsonEvents),
          exitCode: code ?? (success ? 0 : 1),
          error: !success
            ? state.errors?.join('; ') ||
              stderr.slice(-2000) ||
              stdout.slice(-2000) ||
              `Agent exited with code ${code}`
            : undefined,
          stopReason,
          sessionId: state.sessionId,
          costUsd: state.costUsd,
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

function finalOutput(
  opts: AgentRunOpts,
  state: StreamJsonState,
  stdout: string,
  preferLastMessage: boolean,
): string {
  if (opts.outputLastMessagePath) {
    try {
      const text = readFileSync(opts.outputLastMessagePath, 'utf8').trim()
      if (text) return text
    } catch {
      /* no last-message file */
    }
  }
  if (preferLastMessage && state.lastAssistantText) return state.lastAssistantText
  return stdout
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

function parseJsonEvent(event: Record<string, unknown>, state: StreamJsonState): void {
  const sessionId = findStringValue(event, [
    'session_id',
    'sessionId',
    'conversation_id',
    'conversationId',
    'thread_id',
    'threadId',
  ])
  if (sessionId) state.sessionId = sessionId

  const text = findStringValue(event, ['text', 'message', 'content', 'last_message', 'lastMessage'])
  if (text && text.length > state.lastAssistantText.length) state.lastAssistantText = text

  const cost = findNumberValue(event, ['total_cost_usd', 'cost_usd', 'costUsd'])
  if (typeof cost === 'number') state.costUsd = cost

  const type = String(event.type ?? event.event ?? '').toLowerCase()
  const level = String(event.level ?? '').toLowerCase()
  if (type.includes('error') || level === 'error') {
    state.isError = true
    const message = findStringValue(event, ['error', 'message'])
    if (message) state.errors = [...(state.errors ?? []), message]
    state.stopReason = 'error'
  }
}

function findStringValue(value: unknown, keys: string[], depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  for (const candidate of Object.values(record)) {
    const found = findStringValue(candidate, keys, depth + 1)
    if (found) return found
  }
  return undefined
}

function findNumberValue(value: unknown, keys: string[], depth = 0): number | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'number') return candidate
  }
  for (const candidate of Object.values(record)) {
    const found = findNumberValue(candidate, keys, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}
