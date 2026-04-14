import type { Runner, RunnerConfig } from '@appifex/core'
import { LocalRunner } from './local-runner.js'
import { E2BRunner } from './e2b-runner.js'
import { RemoteRunner } from './remote-runner.js'

export function createRunner(config: RunnerConfig, opts?: { cwd?: string; e2bApiKey?: string }): Runner {
  switch (config.type) {
    case 'local':
      return new LocalRunner(opts?.cwd ?? process.cwd())
    case 'e2b':
      if (!config.sandboxId) throw new Error('sandboxId required for E2B runner')
      if (!opts?.e2bApiKey) throw new Error('e2bApiKey required for E2B runner')
      return new E2BRunner({ sandboxId: config.sandboxId, apiKey: opts.e2bApiKey })
    case 'remote':
      if (!config.runnerUrl) throw new Error('runnerUrl required for remote runner')
      if (!config.runnerToken) throw new Error('runnerToken required for remote runner')
      return new RemoteRunner({ runnerUrl: config.runnerUrl, runnerToken: config.runnerToken })
    default:
      throw new Error(`Unknown runner type: ${config.type}`)
  }
}
