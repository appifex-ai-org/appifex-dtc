// Phase 5 (TF-03): End-to-end hygiene verification of archiveSwift's final project.yml shape.
// Asserts Pitfall 1 correct placement (ITSAppUsesNonExemptEncryption -> info.properties),
// TF-03 release keys (DEBUG_INFORMATION_FORMAT + MARKETING_VERSION + CURRENT_PROJECT_VERSION),
// stale xcodeproj cleanup (Q4), and idempotency.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Runner } from '@appifex/core'
import { archiveSwift } from '../src/swift-archive.js'
import { readProjectYml } from '../src/project-yml.js'

const FIXTURE = readFileSync(
  path.resolve(
    __dirname,
    '../../../.planning/phases/05-xcode-archive-testflight-upload/fixtures/project-yml/minimal.yml',
  ),
  'utf-8',
)

function createMockRunner(
  initialFiles: Record<string, string> = {},
  opts: { staleProjs?: string[] } = {},
) {
  const files: Record<string, string> = { ...initialFiles }
  const execCalls: Array<{ cmd: string; args: string[] }> = []
  return {
    _files: files,
    _execCalls: execCalls,
    readFile: async (p: string) => {
      if (p in files) return files[p]
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
    },
    writeFile: async (p: string, c: string) => {
      files[p] = c
    },
    exists: async (p: string) => p in files,
    glob: async (pattern: string) =>
      pattern.endsWith('*.xcodeproj') ? (opts.staleProjs ?? []) : [],
    exec: async (cmd: string, args: string[]) => {
      execCalls.push({ cmd, args })
      return { command: `${cmd} ${args.join(' ')}`, exitCode: 0, stdout: '', stderr: '', duration: 0 }
    },
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      hasXcodegen: false,
      hasJava: false,
      hasAndroidSdk: false,
      hasGradle: false,
      hasAdb: false,
      hasEmulator: false,
      platform: 'darwin',
    },
  } as unknown as Runner & {
    _files: Record<string, string>
    _execCalls: Array<{ cmd: string; args: string[] }>
  }
}

const ARCHIVE_OPTS = {
  projectDir: '/proj',
  scheme: 'App',
  teamId: 'TEAM123',
  bundleId: 'com.example.App',
  marketingVersion: '1.0.3',
  buildNumber: '47',
}

describe('swift-archive hygiene (TF-03)', () => {
  it('writes ITSAppUsesNonExemptEncryption=false to info.properties (Pitfall 1)', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const doc = await readProjectYml(runner, '/proj/project.yml')
    expect(doc.targets.App.info!.properties!.ITSAppUsesNonExemptEncryption).toBe(false)
    const dumped = runner._files['/proj/project.yml']
    expect(dumped).toContain('ITSAppUsesNonExemptEncryption: false')
    expect(dumped).not.toContain('ITSAppUsesNonExemptEncryption: "NO"')
  })

  it('writes DEBUG_INFORMATION_FORMAT=dwarf-with-dsym to settings (TF-03)', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const doc = await readProjectYml(runner, '/proj/project.yml')
    const settings = doc.targets.App.settings as Record<string, unknown>
    expect(settings.DEBUG_INFORMATION_FORMAT).toBe('dwarf-with-dsym')
  })

  it('writes MARKETING_VERSION + CURRENT_PROJECT_VERSION to settings', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const doc = await readProjectYml(runner, '/proj/project.yml')
    const settings = doc.targets.App.settings as Record<string, unknown>
    expect(settings.MARKETING_VERSION).toBe('1.0.3')
    expect(settings.CURRENT_PROJECT_VERSION).toBe('47')
  })

  it('writes DEVELOPMENT_TEAM + PRODUCT_BUNDLE_IDENTIFIER + CODE_SIGN_STYLE', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const doc = await readProjectYml(runner, '/proj/project.yml')
    const settings = doc.targets.App.settings as Record<string, unknown>
    expect(settings.DEVELOPMENT_TEAM).toBe('TEAM123')
    expect(settings.PRODUCT_BUNDLE_IDENTIFIER).toBe('com.example.App')
    expect(settings.CODE_SIGN_STYLE).toBe('Automatic')
  })

  it('removes stale *.xcodeproj before xcodegen generate (Q4)', async () => {
    const runner = createMockRunner(
      { '/proj/project.yml': FIXTURE },
      { staleProjs: ['/proj/Old.xcodeproj'] },
    )
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const rmIdx = runner._execCalls.findIndex(
      (c) => c.cmd === 'rm' && c.args.includes('/proj/Old.xcodeproj'),
    )
    const xgIdx = runner._execCalls.findIndex((c) => c.cmd === 'xcodegen')
    expect(rmIdx).toBeGreaterThanOrEqual(0)
    expect(xgIdx).toBeGreaterThanOrEqual(0)
    expect(rmIdx).toBeLessThan(xgIdx) // rm happens BEFORE xcodegen
  })

  it('NEVER removes *.xcworkspace (SPM-managed)', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner, ARCHIVE_OPTS as any)
    const badCall = runner._execCalls.find(
      (c) => c.cmd === 'rm' && c.args.some((a) => a.includes('.xcworkspace')),
    )
    expect(badCall).toBeUndefined()
  })

  it('is idempotent: re-running produces identical project.yml', async () => {
    const runner1 = createMockRunner({ '/proj/project.yml': FIXTURE })
    await archiveSwift(runner1, ARCHIVE_OPTS as any)
    const firstYml = runner1._files['/proj/project.yml']

    const runner2 = createMockRunner({ '/proj/project.yml': firstYml })
    await archiveSwift(runner2, ARCHIVE_OPTS as any)
    const secondYml = runner2._files['/proj/project.yml']

    // Parse + re-dump both; they should be deep-equal.
    expect(yaml.load(secondYml)).toEqual(yaml.load(firstYml))
  })
})
