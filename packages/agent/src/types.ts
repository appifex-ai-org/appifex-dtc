export type AgentType = 'claude' | 'codex' | 'copilot' | 'gemini' | 'antigravity'

export interface AgentRunOpts {
  /** The full prompt describing the entire task */
  prompt: string
  /** Working directory — agent reads/writes files here */
  cwd: string
  /** Agent-specific model override */
  model?: string
  /** Budget in USD (passed to agent CLI flag) */
  maxBudgetUsd?: number
  /** Hard timeout in ms — if omitted, no timeout (budget-only limit) */
  timeoutMs?: number
  /** Callback for streaming stdout chunks */
  onOutput?: (chunk: string) => void
  /** Path to design image relative to cwd — used by adapters that support system-level image instructions */
  designImagePath?: string
  /** Resume a previous session by ID instead of starting fresh */
  resumeSessionId?: string
}

export type AgentStopReason = 'success' | 'budget_exceeded' | 'timeout' | 'error'

export interface AgentResult {
  success: boolean
  /** Raw stdout from the agent process */
  output: string
  /** Exit code of the agent process */
  exitCode: number
  /** Error message if success=false */
  error?: string
  /** Why the agent stopped */
  stopReason: AgentStopReason
  /** Session ID — can be used to resume later */
  sessionId?: string
  /** Total cost in USD */
  costUsd?: number
}

export interface AgentAdapter {
  /** Agent identifier */
  readonly name: AgentType
  /** Spawn an agent session with the given prompt and cwd */
  run(opts: AgentRunOpts): Promise<AgentResult>
  /** Check if this agent's CLI binary is installed and available */
  isAvailable(): Promise<boolean>
  /** Check if this agent supports base64 image input */
  supportsImages(): boolean
}
