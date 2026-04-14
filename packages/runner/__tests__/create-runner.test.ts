import { describe, it, expect } from 'vitest'
import { createRunner } from '../src/create-runner.js'
import { LocalRunner } from '../src/local-runner.js'
import { E2BRunner } from '../src/e2b-runner.js'
import { RemoteRunner } from '../src/remote-runner.js'

describe('createRunner', () => {
  it('creates LocalRunner for type "local"', () => {
    const runner = createRunner({ type: 'local' })
    expect(runner).toBeInstanceOf(LocalRunner)
  })

  it('creates E2BRunner for type "e2b"', () => {
    const runner = createRunner(
      { type: 'e2b', sandboxId: 'sbx-1' },
      { e2bApiKey: 'key' },
    )
    expect(runner).toBeInstanceOf(E2BRunner)
  })

  it('creates RemoteRunner for type "remote"', () => {
    const runner = createRunner({
      type: 'remote',
      runnerUrl: 'https://runner.local',
      runnerToken: 'amr_tok',
    })
    expect(runner).toBeInstanceOf(RemoteRunner)
  })

  it('throws for E2B without sandboxId', () => {
    expect(() => createRunner({ type: 'e2b' })).toThrow('sandboxId')
  })

  it('throws for remote without runnerUrl', () => {
    expect(() => createRunner({ type: 'remote' })).toThrow('runnerUrl')
  })
})
