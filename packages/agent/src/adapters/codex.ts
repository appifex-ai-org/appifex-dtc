import { which } from '../util.js'
import { spawnAgent } from './base.js'
import type { AgentAdapter, AgentRunOpts, AgentResult } from '../types.js'

export class CodexAgent implements AgentAdapter {
  readonly name = 'codex' as const

  async run(opts: AgentRunOpts): Promise<AgentResult> {
    const args = [
      '--quiet',
      '--model', opts.model ?? 'codex-1',
      '--approval-mode', 'full-auto',
    ]
    return spawnAgent('codex', args, opts)
  }

  async isAvailable(): Promise<boolean> {
    return which('codex')
  }

  supportsImages(): boolean {
    return true
  }
}
