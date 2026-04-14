import type { AgentAdapter, AgentType } from './types.js'
import { ClaudeCodeAgent } from './adapters/claude.js'
import { CodexAgent } from './adapters/codex.js'
import { GeminiAgent } from './adapters/gemini.js'

/** Priority order for auto-detection */
const AGENT_PRIORITY: AgentType[] = ['claude', 'codex', 'gemini']

const ADAPTERS: Partial<Record<AgentType, () => AgentAdapter>> = {
  claude: () => new ClaudeCodeAgent(),
  codex: () => new CodexAgent(),
  gemini: () => new GeminiAgent(),
}

export function createAgent(type: AgentType): AgentAdapter {
  const factory = ADAPTERS[type]
  if (!factory) throw new Error(`Agent '${type}' is not yet implemented`)
  return factory()
}

/** Auto-detect the first available agent CLI, in priority order */
export async function detectAgent(): Promise<AgentAdapter | null> {
  for (const type of AGENT_PRIORITY) {
    const factory = ADAPTERS[type]
    if (!factory) continue
    const agent = factory()
    if (await agent.isAvailable()) return agent
  }
  return null
}
