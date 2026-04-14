/**
 * Auth template generation tests.
 *
 * Tests generateAuthTemplates() for Firebase and Supabase providers.
 * Validates that generated AuthManager files:
 * - Use correct provider-specific SDK patterns
 * - Never contain deprecated FirebaseDynamicLinks imports
 * - Follow singleton pattern with proper state observation
 */
import { describe, it, expect } from 'vitest'
import { generateAuthTemplates } from '../src/auth-templates.js'

describe('generateAuthTemplates — AuthManager', () => {
  // Test 1: Firebase Swift AuthManager at correct path with ObservableObject
  it('generates Firebase Swift AuthManager with ObservableObject', () => {
    const result = generateAuthTemplates('firebase', ['swift', 'kotlin'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('AuthManager')
    expect(swift!.content).toContain('ObservableObject')
  })

  // Test 2: Firebase Swift AuthManager contains correct signIn and signUp calls
  it('Firebase Swift AuthManager uses Auth.auth().signIn and createUser', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('Auth.auth().signIn(withEmail:')
    expect(swift!.content).toContain('Auth.auth().createUser(withEmail:')
  })

  // Test 3: Firebase Kotlin AuthManager at correct path with object and StateFlow
  it('generates Firebase Kotlin AuthManager with object and StateFlow', () => {
    const result = generateAuthTemplates('firebase', ['kotlin'])
    const kotlin = result.find((f) => f.path === 'app/src/main/java/auth/AuthManager.kt')
    expect(kotlin).toBeDefined()
    expect(kotlin!.content).toContain('object AuthManager')
    expect(kotlin!.content).toContain('StateFlow')
  })

  // Test 4: Supabase Swift AuthManager uses correct signIn API
  it('Supabase Swift AuthManager uses supabase.auth.signIn(email:', () => {
    const result = generateAuthTemplates('supabase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('supabase.auth.signIn(email:')
  })

  // Test 5: Supabase Kotlin AuthManager uses signInWith(Email) DSL
  it('Supabase Kotlin AuthManager uses signInWith(Email)', () => {
    const result = generateAuthTemplates('supabase', ['kotlin'])
    const kotlin = result.find((f) => f.path === 'app/src/main/java/auth/AuthManager.kt')
    expect(kotlin).toBeDefined()
    expect(kotlin!.content).toContain('signInWith(Email)')
  })

  // Test 6: All AuthManager files contain all 6 methods
  it('all AuthManager files contain all 6 auth methods', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift', 'kotlin'])
      const authManagers = result.filter((f) => f.path.includes('AuthManager'))
      expect(authManagers.length).toBe(2)

      for (const file of authManagers) {
        expect(file.content).toContain('signIn')
        expect(file.content).toContain('signUp')
        expect(file.content).toContain('signOut')
        expect(file.content).toContain('sendPasswordReset')
        expect(file.content).toContain('confirmPasswordReset')
        expect(file.content).toContain(
          file.path.endsWith('.swift') ? 'observeAuthState' : 'isAuthenticated',
        )
      }
    }
  })

  // Test 7: No Firebase template contains FirebaseDynamicLinks
  it('no Firebase template contains FirebaseDynamicLinks import', () => {
    const result = generateAuthTemplates('firebase', ['swift', 'kotlin'])
    for (const file of result) {
      expect(file.content).not.toContain('FirebaseDynamicLinks')
    }
  })

  // Test 8: Firebase Swift AuthManager contains ActionCodeSettings
  it('Firebase Swift AuthManager uses ActionCodeSettings for password reset', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('ActionCodeSettings')
  })

  // Test 9: Supabase Swift AuthManager wraps @Published update in MainActor.run
  it('Supabase Swift AuthManager uses MainActor.run for state updates', () => {
    const result = generateAuthTemplates('supabase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('MainActor.run')
  })

  // Test 10: Firebase Kotlin AuthManager contains awaitClose for listener cleanup
  it('Firebase Kotlin AuthManager uses awaitClose in callbackFlow', () => {
    const result = generateAuthTemplates('firebase', ['kotlin'])
    const kotlin = result.find((f) => f.path === 'app/src/main/java/auth/AuthManager.kt')
    expect(kotlin).toBeDefined()
    expect(kotlin!.content).toContain('awaitClose')
  })

  // Test 11: Supabase Swift AuthManager has isPasswordReset published property
  it('Supabase Swift AuthManager has @Published isPasswordReset property', () => {
    const result = generateAuthTemplates('supabase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('@Published var isPasswordReset: Bool')
  })

  // Test 12: Supabase Swift AuthManager detects .passwordRecovery event
  it('Supabase Swift AuthManager detects .passwordRecovery event', () => {
    const result = generateAuthTemplates('supabase', ['swift'])
    const swift = result.find((f) => f.path === 'Sources/Auth/AuthManager.swift')
    expect(swift).toBeDefined()
    expect(swift!.content).toContain('.passwordRecovery')
    expect(swift!.content).toContain('isPasswordReset = true')
  })
})

describe('generateAuthTemplates — Screen Templates', () => {
  // Test 1: Firebase Swift LoginView contains AuthManager.shared.signIn and title
  it('Firebase Swift LoginView contains AuthManager.shared.signIn and Sign in title', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const login = result.find((f) => f.path === 'Sources/Auth/LoginView.swift')
    expect(login).toBeDefined()
    expect(login!.content).toContain('AuthManager.shared')
    expect(login!.content).toContain('signIn')
    expect(login!.content).toContain('Sign in')
  })

  // Test 2: Firebase Swift SignupView contains AuthManager.shared.signUp and title
  it('Firebase Swift SignupView contains AuthManager.shared.signUp and Create account title', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const signup = result.find((f) => f.path === 'Sources/Auth/SignupView.swift')
    expect(signup).toBeDefined()
    expect(signup!.content).toContain('AuthManager.shared')
    expect(signup!.content).toContain('signUp')
    expect(signup!.content).toContain('Create account')
  })

  // Test 3: Firebase Swift ResetPasswordView contains sendPasswordReset and button text
  it('Firebase Swift ResetPasswordView contains sendPasswordReset and Send reset link', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const reset = result.find((f) => f.path === 'Sources/Auth/ResetPasswordView.swift')
    expect(reset).toBeDefined()
    expect(reset!.content).toContain('AuthManager.shared')
    expect(reset!.content).toContain('sendPasswordReset')
    expect(reset!.content).toContain('Send reset link')
  })

  // Test 4: Firebase Swift NewPasswordView contains confirmPasswordReset and button text
  it('Firebase Swift NewPasswordView contains confirmPasswordReset and Update password', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const newPw = result.find((f) => f.path === 'Sources/Auth/NewPasswordView.swift')
    expect(newPw).toBeDefined()
    expect(newPw!.content).toContain('AuthManager.shared')
    expect(newPw!.content).toContain('confirmPasswordReset')
    expect(newPw!.content).toContain('Update password')
  })

  // Test 5: All Swift screen templates contain @State private var error for inline error display
  it('all Swift screen templates contain @State private var error', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const screens = result.filter(
      (f) => f.path.startsWith('Sources/Auth/') && !f.path.includes('AuthManager'),
    )
    expect(screens.length).toBe(4)
    for (const screen of screens) {
      expect(screen.content).toContain('@State private var error')
    }
  })

  // Test 6: All Swift screen templates contain ProgressView() for loading state
  it('all Swift screen templates contain ProgressView() for loading state', () => {
    const result = generateAuthTemplates('firebase', ['swift'])
    const screens = result.filter(
      (f) => f.path.startsWith('Sources/Auth/') && !f.path.includes('AuthManager'),
    )
    for (const screen of screens) {
      expect(screen.content).toContain('ProgressView()')
    }
  })

  // Test 7: Supabase Swift LoginView uses same AuthManager.shared API
  it('Supabase Swift LoginView uses same AuthManager.shared API as Firebase', () => {
    const result = generateAuthTemplates('supabase', ['swift'])
    const login = result.find((f) => f.path === 'Sources/Auth/LoginView.swift')
    expect(login).toBeDefined()
    expect(login!.content).toContain('AuthManager.shared')
    expect(login!.content).toContain('signIn')
  })

  // Test 8: Kotlin LoginScreen contains AuthManager.signIn and Compose structure
  it('Kotlin LoginScreen contains AuthManager.signIn and Compose structure', () => {
    const result = generateAuthTemplates('firebase', ['kotlin'])
    const login = result.find((f) => f.path === 'app/src/main/java/auth/LoginScreen.kt')
    expect(login).toBeDefined()
    expect(login!.content).toContain('AuthManager.signIn')
    expect(login!.content).toContain('@Composable')
  })

  // Test 9: All Kotlin screen templates contain error text display
  it('all Kotlin screen templates contain Text(error for inline error display', () => {
    const result = generateAuthTemplates('firebase', ['kotlin'])
    const screens = result.filter(
      (f) => f.path.startsWith('app/src/main/java/auth/') && !f.path.includes('AuthManager'),
    )
    expect(screens.length).toBe(4)
    for (const screen of screens) {
      expect(screen.content).toContain('Text(error')
    }
  })

  // Test 10: generateAuthTemplates returns exactly 10 files per provider (both platforms)
  it('generateAuthTemplates returns exactly 10 files for both platforms', () => {
    const result = generateAuthTemplates('firebase', ['swift', 'kotlin'])
    expect(result.length).toBe(10) // 1 AuthManager + 4 screens per platform
  })

  // Test 11: No screen template contains hardcoded API keys or hex strings > 20 chars
  it('no screen template contains hardcoded API keys or long hex strings', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift', 'kotlin'])
      const hexPattern = /[0-9a-fA-F]{21,}/
      for (const file of result) {
        expect(file.content).not.toMatch(hexPattern)
      }
    }
  })

  // Test 12: Login templates contain signup navigation link
  it('Login templates contain "Don\'t have an account? Sign up" navigation link', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift'])
      const login = result.find((f) => f.path === 'Sources/Auth/LoginView.swift')
      expect(login!.content).toContain("Don't have an account? Sign up")
    }
  })

  // Test 13: Signup templates contain login navigation link
  it('Signup templates contain "Already have an account? Sign in" navigation link', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift'])
      const signup = result.find((f) => f.path === 'Sources/Auth/SignupView.swift')
      expect(signup!.content).toContain('Already have an account? Sign in')
    }
  })

  // Test 14: Login templates contain forgot password link
  it('Login templates contain "Forgot your password?" link', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift'])
      const login = result.find((f) => f.path === 'Sources/Auth/LoginView.swift')
      expect(login!.content).toContain('Forgot your password?')
    }
  })

  // Test 15: Signup templates contain password minimum length check
  it('Signup templates contain password minimum length check (8 chars)', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateAuthTemplates(provider, ['swift'])
      const signup = result.find((f) => f.path === 'Sources/Auth/SignupView.swift')
      expect(signup!.content).toContain('8')
    }
  })
})
