// Phase 6 (VAL-01 D-05): RED test locking the stable Maestro accessibility
// IDs that the signup template must expose. Includes the signIn_existingAccount
// fall-through affordance required by the e2e-gate golden-path flow (D-04, D-05).
// Currently absent from signup-view.swift.eta — Plan 06-04 adds them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TEMPLATE_PATH = resolve(__dirname, '../src/templates/firebase/signup-view.swift.eta')

describe('signup-view.swift.eta accessibility IDs — Phase 6 (VAL-01 D-05)', () => {
  const TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf-8')

  it('Test 1: exposes signIn_existingAccount affordance', () => {
    expect(TEMPLATE).toContain('.accessibilityIdentifier("signIn_existingAccount")')
  })

  it('Test 2: exposes form-field accessibility IDs (signup_email, signup_password, signup_confirmPassword, signup_submit)', () => {
    expect(TEMPLATE).toContain('.accessibilityIdentifier("signup_email")')
    expect(TEMPLATE).toContain('.accessibilityIdentifier("signup_password")')
    expect(TEMPLATE).toContain('.accessibilityIdentifier("signup_confirmPassword")')
    expect(TEMPLATE).toContain('.accessibilityIdentifier("signup_submit")')
  })
})
