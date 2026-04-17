// Phase 4 Wave-0 stub — FIRE-01: Firebase SDK codegen (SPM config, AppDelegate wiring).
// Bodies implemented in Phase 4 Plan 01 task execution.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchProjectDependencies } from '@appifex/build'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = resolve(__dirname, '../src/templates/firebase')

function readTemplate(name: string): string {
  return readFileSync(resolve(TEMPLATE_DIR, name), 'utf-8')
}

describe('firebase-codegen (FIRE-01)', () => {
  it('generated app-entry template includes @UIApplicationDelegateAdaptor with Firebase-configured AppDelegate', () => {
    const content = readTemplate('app-entry.swift.eta')
    expect(content).toContain('@UIApplicationDelegateAdaptor(AppDelegate.self) var delegate')
  })

  it('generated project.yml lists firebase-ios-sdk via SPM (no CocoaPods reference)', async () => {
    const minimalYml = `name: App
options:
  bundleIdPrefix: com.dtc
targets:
  App:
    type: application
    platform: iOS
    sources:
      - path: Sources
  AppTests:
    type: bundle.unit-test
    platform: iOS
`
    let written = ''
    const mockRunner = {
      readFile: vi.fn().mockImplementation((path: string) => {
        if (path.endsWith('project.yml')) return Promise.resolve(written || minimalYml)
        return Promise.reject(new Error(`ENOENT: ${path}`))
      }),
      writeFile: vi.fn().mockImplementation((_path: string, content: string) => {
        written = content
        return Promise.resolve()
      }),
    }

    await patchProjectDependencies(mockRunner as never, '/fake/project', 'firebase')

    // writeFile should have been called at least once (for the packages block injection)
    expect(mockRunner.writeFile).toHaveBeenCalled()
    const outputYml: string = mockRunner.writeFile.mock.calls[0][1] as string
    expect(outputYml).toContain('packages:')
    expect(outputYml).toContain('firebase-ios-sdk')
    expect(outputYml).not.toContain('pod ')
    expect(outputYml).not.toContain('Podfile')
  })

  it('FirebaseApp.configure() call is present in AppDelegate.application(_:didFinishLaunchingWithOptions:)', () => {
    const content = readTemplate('app-entry.swift.eta')
    expect(content).toContain('FirebaseApp.configure()')
  })
})
