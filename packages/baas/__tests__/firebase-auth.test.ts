// Phase 4 Wave-0 stub — FIRE-02: Firebase auth provider templates (Apple Sign In, Google Sign In).
// Bodies implemented in Phase 4 Plan 02 task execution.
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

describe('firebase-auth templates (FIRE-02)', () => {
  it('auth-manager template includes signInWithApple with SHA-256 hashed nonce using CryptoKit', () => {
    const content = readTemplate('auth-manager.swift.eta')
    expect(content).toContain('sha256(nonce)')
    expect(content).toContain('CryptoKit')
  })

  it('auth-manager template passes raw nonce (not hashed) to Firebase OAuthProvider.appleCredential', () => {
    const content = readTemplate('auth-manager.swift.eta')
    // raw nonce passed to Firebase — separate line from the sha256 line
    expect(content).toContain('rawNonce: nonce')
  })

  it('auth-manager template includes signInWithGoogle using GIDSignIn', () => {
    const content = readTemplate('auth-manager.swift.eta')
    expect(content).toContain('GIDSignIn')
  })

  it('login-view template places SignInWithAppleButton before Google Sign In button (Apple HIG order)', () => {
    const content = readTemplate('login-view.swift.eta')
    const appleIdx = content.indexOf('SignInWithAppleButton')
    const googleIdx = content.indexOf('Sign in with Google')
    expect(appleIdx).toBeGreaterThan(-1)
    expect(googleIdx).toBeGreaterThan(-1)
    expect(appleIdx).toBeLessThan(googleIdx)
  })

  it('login-view template includes a Divider between email/password block and SSO buttons', () => {
    const content = readTemplate('login-view.swift.eta')
    expect(content).toContain('Divider()')
  })

  it('patchProjectDependencies injects GoogleSignIn-iOS SPM package alongside firebase-ios-sdk', async () => {
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

    expect(mockRunner.writeFile).toHaveBeenCalled()
    const outputYml: string = mockRunner.writeFile.mock.calls[0][1] as string
    expect(outputYml).toContain('firebase-ios-sdk')
    expect(outputYml).toContain('GoogleSignIn-iOS')
  })

  it('patchProjectDependencies injects REVERSED_CLIENT_ID URL scheme via js-yaml (yaml.load/yaml.dump, no regex for URL scheme block)', async () => {
    // Start WITHOUT packages: so the idempotency guard does not short-circuit.
    // After patchProjectDependencies writes the packages block, the second readFile
    // of project.yml returns the patched content (with packages:), and the function
    // then injects REVERSED_CLIENT_ID via yaml.load/yaml.dump.
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
    const fakePlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>REVERSED_CLIENT_ID</key>
  <string>com.googleusercontent.apps.12345-abcdef</string>
</dict>
</plist>`

    let lastWritten = ''
    const mockRunner = {
      readFile: vi.fn().mockImplementation((path: string) => {
        if (path.endsWith('GoogleService-Info.plist')) return Promise.resolve(fakePlist)
        if (path.endsWith('project.yml')) return Promise.resolve(lastWritten || minimalYml)
        return Promise.reject(new Error(`ENOENT: ${path}`))
      }),
      writeFile: vi.fn().mockImplementation((_path: string, content: string) => {
        lastWritten = content
        return Promise.resolve()
      }),
    }

    await patchProjectDependencies(mockRunner as never, '/fake/project', 'firebase')

    // The REVERSED_CLIENT_ID URL scheme should have been injected via yaml.load/yaml.dump
    expect(mockRunner.writeFile).toHaveBeenCalled()
    const outputYml: string = lastWritten
    expect(outputYml).toContain('com.googleusercontent.apps.12345-abcdef')
    expect(outputYml).toContain('CFBundleURLSchemes')
  })
})
