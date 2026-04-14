/**
 * Auth deep link config generation tests.
 *
 * Tests generateAuthDeepLinkConfig() for Firebase and Supabase providers.
 * Validates that generated deep link config files:
 * - Use correct platform-specific patterns (Associated Domains, URL schemes, intent filters)
 * - Never reference deprecated Firebase Dynamic Links (page.link)
 * - Use REPLACE_* placeholders (no hardcoded keys or project IDs)
 */
import { describe, it, expect } from 'vitest'
import { generateAuthDeepLinkConfig } from '../src/auth-deep-link.js'

describe('generateAuthDeepLinkConfig', () => {
  // Test 1: Firebase returns files containing Associated Domains info
  it('Firebase deep link config contains Associated Domains setup', () => {
    const files = generateAuthDeepLinkConfig('firebase')
    expect(files.length).toBeGreaterThan(0)
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('Associated Domains')
  })

  // Test 2: Firebase deep link config contains REPLACE_PROJECT_ID.firebaseapp.com
  it('Firebase deep link config contains REPLACE_PROJECT_ID.firebaseapp.com', () => {
    const files = generateAuthDeepLinkConfig('firebase')
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('REPLACE_PROJECT_ID.firebaseapp.com')
  })

  // Test 3: Firebase deep link config does NOT contain page.link
  it('Firebase deep link config does NOT contain page.link (deprecated Dynamic Links)', () => {
    const files = generateAuthDeepLinkConfig('firebase')
    for (const f of files) {
      expect(f.content).not.toContain('page.link')
    }
  })

  // Test 4: Supabase returns a file containing CFBundleURLSchemes
  it('Supabase deep link config contains CFBundleURLSchemes', () => {
    const files = generateAuthDeepLinkConfig('supabase')
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('CFBundleURLSchemes')
  })

  // Test 5: Supabase deep link config contains REPLACE_URL_SCHEME placeholder
  it('Supabase deep link config contains REPLACE_URL_SCHEME placeholder', () => {
    const files = generateAuthDeepLinkConfig('supabase')
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('REPLACE_URL_SCHEME')
  })

  // Test 6: Supabase includes Android intent filter with android.intent.action.VIEW
  it('Supabase includes Android intent filter with android.intent.action.VIEW and REPLACE_URL_SCHEME', () => {
    const files = generateAuthDeepLinkConfig('supabase')
    const androidFile = files.find(f => f.content.includes('android.intent.action.VIEW'))
    expect(androidFile).toBeDefined()
    expect(androidFile!.content).toContain('REPLACE_URL_SCHEME')
  })

  // Test 7: Firebase includes Android intent filter with android.intent.action.VIEW
  it('Firebase includes Android intent filter with android.intent.action.VIEW', () => {
    const files = generateAuthDeepLinkConfig('firebase')
    const androidFile = files.find(f => f.content.includes('android.intent.action.VIEW'))
    expect(androidFile).toBeDefined()
  })

  // Test 8: Neither provider config contains hardcoded API keys
  it('neither provider config contains hardcoded API keys', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const files = generateAuthDeepLinkConfig(provider)
      for (const f of files) {
        // No hex strings longer than 20 chars (would indicate a real key)
        const hexPattern = /[0-9a-fA-F]{21,}/
        expect(f.content).not.toMatch(hexPattern)
      }
    }
  })
})
