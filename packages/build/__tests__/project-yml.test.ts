import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Runner } from '@appifex/core'
import {
  readProjectYml,
  writeProjectYml,
  setBuildSetting,
  setInfoProperty,
  findAppTargetName,
  type ProjectYml,
} from '../src/project-yml.js'

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../.planning/phases/05-xcode-archive-testflight-upload/fixtures/project-yml/minimal.yml',
)
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf-8')

function createMockRunner(initialFiles: Record<string, string> = {}): Runner & {
  _files: Record<string, string>
} {
  const files: Record<string, string> = { ...initialFiles }
  return {
    _files: files,
    readFile: async (p: string) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`)
      return files[p]
    },
    writeFile: async (p: string, c: string) => {
      files[p] = c
    },
    exists: async (p: string) => p in files,
    glob: async () => [],
    exec: async () => ({
      command: '',
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: 0,
    }),
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
  } as unknown as Runner & { _files: Record<string, string> }
}

describe('project-yml helpers', () => {
  it('Test 1: readProjectYml loads minimal.yml and returns App + AppTests targets', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    expect(doc.targets.App).toBeDefined()
    expect(doc.targets.AppTests).toBeDefined()
  })

  it('Test 2: findAppTargetName returns "App" (excludes *Tests via suffix heuristic)', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    expect(findAppTargetName(doc)).toBe('App')
  })

  it('Test 3: findAppTargetName throws when only Tests targets exist', () => {
    const doc = {
      name: 'Proj',
      targets: { FooTests: { type: 'bundle.unit-test' } },
    } as unknown as ProjectYml
    expect(() => findAppTargetName(doc)).toThrowError(
      'No app target found in project.yml',
    )
  })

  it('Test 4: setBuildSetting writes into flat settings', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    setBuildSetting(doc, 'App', 'DEBUG_INFORMATION_FORMAT', 'dwarf-with-dsym')
    const settings = doc.targets.App.settings as Record<string, unknown>
    expect(settings.DEBUG_INFORMATION_FORMAT).toBe('dwarf-with-dsym')
  })

  it('Test 5: setBuildSetting writes into settings.base when settings has a base key', () => {
    const doc: ProjectYml = {
      name: 'App',
      targets: {
        App: {
          type: 'application',
          settings: { base: { FOO: 'BAR' } },
        },
      },
    }
    setBuildSetting(doc, 'App', 'MARKETING_VERSION', '1.0.3')
    const settings = doc.targets.App.settings as { base: Record<string, unknown> }
    expect(settings.base.MARKETING_VERSION).toBe('1.0.3')
    // Verify no sibling key was added at settings root
    expect((settings as Record<string, unknown>).MARKETING_VERSION).toBeUndefined()
  })

  it('Test 6 (Pitfall 2): setBuildSetting writes "NO" as string, dumped YAML shows ENABLE_BITCODE: "NO" quoted', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    setBuildSetting(doc, 'App', 'ENABLE_BITCODE', 'NO')
    const settings = doc.targets.App.settings as Record<string, unknown>
    expect(settings.ENABLE_BITCODE).toBe('NO')
    expect(typeof settings.ENABLE_BITCODE).toBe('string')
    const dumped = yaml.dump(doc, { quotingType: '"' })
    expect(dumped).toContain('ENABLE_BITCODE: "NO"')
  })

  it('Test 7 (Pitfall 1): setInfoProperty writes ITSAppUsesNonExemptEncryption as boolean false, dumped YAML is unquoted', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    setInfoProperty(doc, 'App', 'ITSAppUsesNonExemptEncryption', false)
    const props = doc.targets.App.info!.properties as Record<string, unknown>
    expect(props.ITSAppUsesNonExemptEncryption).toBe(false)
    expect(typeof props.ITSAppUsesNonExemptEncryption).toBe('boolean')
    const dumped = yaml.dump(doc, { quotingType: '"' })
    expect(dumped).toContain('ITSAppUsesNonExemptEncryption: false')
    expect(dumped).not.toContain('ITSAppUsesNonExemptEncryption: "NO"')
    expect(dumped).not.toContain('ITSAppUsesNonExemptEncryption: NO')
  })

  it('Test 8: setInfoProperty creates info block if missing', () => {
    const doc: ProjectYml = {
      name: 'App',
      targets: { Bar: { type: 'application' } },
    }
    setInfoProperty(doc, 'Bar', 'CFBundleDisplayName', 'Bar')
    expect(doc.targets.Bar.info).toBeDefined()
    expect(doc.targets.Bar.info!.properties).toBeDefined()
    expect(doc.targets.Bar.info!.properties!.CFBundleDisplayName).toBe('Bar')
  })

  it('Test 9 (Pitfall 11): round-trip writeProjectYml(readProjectYml(...)) preserves document structure', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc = await readProjectYml(runner, '/proj/project.yml')
    await writeProjectYml(runner, '/proj/project.yml', doc)
    const output = runner._files['/proj/project.yml']
    // Structural equality: re-parsing both inputs should yield deep-equal docs
    expect(yaml.load(output)).toEqual(yaml.load(FIXTURE))
  })

  it('Test 10: idempotency — applying setBuildSetting twice produces identical dumped output', async () => {
    const runner = createMockRunner({ '/proj/project.yml': FIXTURE })
    const doc1 = await readProjectYml(runner, '/proj/project.yml')
    setBuildSetting(doc1, 'App', 'MARKETING_VERSION', '1.0.3')
    const dump1 = yaml.dump(doc1, { lineWidth: -1, noRefs: true, quotingType: '"' })

    const doc2 = await readProjectYml(runner, '/proj/project.yml')
    setBuildSetting(doc2, 'App', 'MARKETING_VERSION', '1.0.3')
    setBuildSetting(doc2, 'App', 'MARKETING_VERSION', '1.0.3')
    const dump2 = yaml.dump(doc2, { lineWidth: -1, noRefs: true, quotingType: '"' })

    expect(dump1).toBe(dump2)
  })

  it('Test 11: writeProjectYml serializes with lineWidth:-1, noRefs, quotingType — no line folding, no anchors', async () => {
    const longValue = 'x'.repeat(200)
    const doc: ProjectYml = {
      name: 'App',
      targets: {
        App: {
          type: 'application',
          settings: { LONG_KEY: longValue },
        },
      },
    }
    const runner = createMockRunner()
    await writeProjectYml(runner, '/proj/project.yml', doc)
    const out = runner._files['/proj/project.yml']
    // No anchors (noRefs)
    expect(out).not.toMatch(/ &\w+/)
    // No line folding: the long value should appear on a single line
    const longLineMatch = out.split('\n').find((line) => line.includes(longValue))
    expect(longLineMatch).toBeDefined()
  })

  it('Test 12: setBuildSetting throws if target not found, including target name', () => {
    const doc: ProjectYml = {
      name: 'App',
      targets: { App: { type: 'application' } },
    }
    expect(() => setBuildSetting(doc, 'Nope', 'FOO', 'BAR')).toThrowError(
      'target Nope not found in project.yml',
    )
  })

  it('Test 13: setInfoProperty throws if target not found, including target name', () => {
    const doc: ProjectYml = {
      name: 'App',
      targets: { App: { type: 'application' } },
    }
    expect(() => setInfoProperty(doc, 'Nope', 'CFBundleDisplayName', 'X')).toThrowError(
      'target Nope not found in project.yml',
    )
  })
})
