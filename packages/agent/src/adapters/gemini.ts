import { which } from '../util.js'
import { spawnAgent } from './base.js'
import type { AgentAdapter, AgentRunOpts, AgentResult } from '../types.js'

export class GeminiAgent implements AgentAdapter {
  readonly name = 'gemini' as const

  async run(opts: AgentRunOpts): Promise<AgentResult> {
    const args = [
      '--model', opts.model ?? 'gemini-2.5-pro',
    ]
    return spawnAgent('gemini', args, opts)
  }

  async isAvailable(): Promise<boolean> {
    return which('gemini')
  }

  supportsImages(): boolean {
    return true
  }
}
