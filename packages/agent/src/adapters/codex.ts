import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { which } from '../util.js'
import { spawnAgent } from './base.js'
import type { AgentAdapter, AgentRunOpts, AgentResult } from '../types.js'

export class CodexAgent implements AgentAdapter {
  readonly name = 'codex' as const

  async run(opts: AgentRunOpts): Promise<AgentResult> {
    const tempDir = await mkdtemp(join(tmpdir(), 'dtc-codex-agent-'))
    const outputLastMessagePath = join(tempDir, 'last-message.txt')
    const args = opts.resumeSessionId
      ? ['exec', 'resume', '--full-auto', '--skip-git-repo-check']
      : ['exec', '--full-auto', '--sandbox', 'workspace-write', '--skip-git-repo-check']
    args.push('--json', '--output-last-message', outputLastMessagePath)
    if (opts.model && opts.model !== 'default') {
      args.push('--model', opts.model)
    }
    if (opts.designImagePath) {
      args.push('--image', opts.designImagePath)
    }
    if (opts.resumeSessionId) {
      args.push(opts.resumeSessionId)
    }
    args.push('-')
    return spawnAgent('codex', args, { ...opts, outputLastMessagePath })
  }

  async isAvailable(): Promise<boolean> {
    return which('codex')
  }

  supportsImages(): boolean {
    return true
  }
}
