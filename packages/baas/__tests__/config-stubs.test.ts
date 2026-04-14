/**
 * Config stubs generation tests.
 *
 * Tests generateConfigStubs() for Firebase and Supabase providers.
 * Validates that generated config files:
 * - Use placeholder values (REPLACE_WITH_* or placeholder-*)
 * - Include .gitignore entries for credential files
 * - Never contain real API keys
 */
import { describe, it, expect } from 'vitest'
import { generateConfigStubs } from '../src/config-stubs.js'

describe('generateConfigStubs', () => {
  // Test 7: Firebase returns GoogleService-Info.plist with REPLACE_WITH_ placeholders
  it('generates Firebase GoogleService-Info.plist with REPLACE_WITH_ placeholders', () => {
    const files = generateConfigStubs('firebase')
    const plist = files.find((f) => f.path === 'GoogleService-Info.plist')
    expect(plist).toBeDefined()
    expect(plist!.content).toContain('REPLACE_WITH_')
  })

  // Test 8: Supabase returns .env with placeholder values
  it('generates Supabase .env with placeholder values', () => {
    const files = generateConfigStubs('supabase')
    const env = files.find((f) => f.path === '.env')
    expect(env).toBeDefined()
    expect(env!.content).toContain('placeholder')
  })

  // Test 9: Returns .gitignore entries containing GoogleService-Info.plist and .env
  it('returns .gitignore entries with credential file patterns', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const files = generateConfigStubs(provider)
      const gitignore = files.find((f) => f.path === '.gitignore.baas')
      expect(gitignore).toBeDefined()
      expect(gitignore!.content).toContain('GoogleService-Info.plist')
      expect(gitignore!.content).toContain('.env')
    }
  })

  // Test 10: No config stub contains a real API key
  it('no config stub contains a real API key pattern', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const files = generateConfigStubs(provider)
      for (const f of files) {
        // No hex strings longer than 20 chars (would be a real key)
        const hexPattern = /[0-9a-fA-F]{21,}/
        expect(f.content).not.toMatch(hexPattern)
        // No Base64-like strings longer than 30 chars that aren't placeholders
        // (skip this check for plist XML boilerplate)
        if (!f.path.endsWith('.plist')) {
          const suspiciousPattern = /[A-Za-z0-9+/=]{31,}/
          const lines = f.content.split('\n')
          for (const line of lines) {
            if (
              line.includes('placeholder') ||
              line.includes('REPLACE_WITH_') ||
              line.includes('#')
            )
              continue
            expect(line).not.toMatch(suspiciousPattern)
          }
        }
      }
    }
  })
})
