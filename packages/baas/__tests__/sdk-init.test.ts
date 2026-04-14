/**
 * SDK init generation tests.
 *
 * Tests generateSdkInit() for Firebase and Supabase providers.
 * Validates that generated AppEntry.swift files:
 * - Use correct SDK initialization patterns
 * - Never contain hardcoded API keys
 * - Follow SwiftUI @main struct pattern
 */
import { describe, it, expect } from 'vitest'
import { generateSdkInit } from '../src/sdk-init.js'

describe('generateSdkInit', () => {
  // Test 1: Firebase returns GeneratedFile at Sources/AppEntry.swift with FirebaseApp.configure()
  it('generates Firebase AppEntry.swift with FirebaseApp.configure()', () => {
    const result = generateSdkInit('firebase')
    expect(result.path).toBe('Sources/AppEntry.swift')
    expect(result.content).toContain('FirebaseApp.configure()')
  })

  // Test 2: Supabase returns GeneratedFile at Sources/AppEntry.swift with SupabaseClient(
  it('generates Supabase AppEntry.swift with SupabaseClient(', () => {
    const result = generateSdkInit('supabase')
    expect(result.path).toBe('Sources/AppEntry.swift')
    expect(result.content).toContain('SupabaseClient(')
  })

  // Test 3: Firebase AppEntry contains UIApplicationDelegateAdaptor
  it('Firebase AppEntry contains UIApplicationDelegateAdaptor', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('UIApplicationDelegateAdaptor')
  })

  // Test 4: Supabase AppEntry reads from ProcessInfo.processInfo.environment
  it('Supabase AppEntry reads from ProcessInfo.processInfo.environment', () => {
    const result = generateSdkInit('supabase')
    expect(result.content).toContain('ProcessInfo.processInfo.environment')
  })

  // Test 5: Neither AppEntry contains real API key patterns (no hex strings > 20 chars)
  it('neither provider generates content with real API key patterns', () => {
    for (const provider of ['firebase', 'supabase'] as const) {
      const result = generateSdkInit(provider)
      // No hex strings longer than 20 characters (would indicate a hardcoded key)
      const hexPattern = /[0-9a-fA-F]{21,}/
      expect(result.content).not.toMatch(hexPattern)
    }
  })

  // Test 6: Firebase returns @main struct AppEntry: App
  it('generates @main struct AppEntry: App for Firebase', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('@main')
    expect(result.content).toContain('struct AppEntry: App')
  })

  // === Auth guard and deep link handler tests (Phase 21) ===

  // Test 7: Firebase AppEntry contains @StateObject authManager
  it('Firebase AppEntry contains @StateObject private var authManager = AuthManager.shared', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('@StateObject private var authManager = AuthManager.shared')
  })

  // Test 8: Firebase AppEntry contains auth guard conditional
  it('Firebase AppEntry contains if authManager.isAuthenticated', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('if authManager.isAuthenticated')
  })

  // Test 9: Firebase AppEntry routes to ContentView (authenticated) and LoginView (else)
  it('Firebase AppEntry contains ContentView in authenticated branch and LoginView in else branch', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('ContentView()')
    expect(result.content).toContain('LoginView()')
  })

  // Test 10: Firebase AppDelegate contains continueUserActivity for universal link handling
  it('Firebase AppDelegate contains continueUserActivity for universal link handling', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('continue userActivity: NSUserActivity')
  })

  // Test 11: Firebase AppEntry does NOT contain deprecated DynamicLinks
  it('Firebase AppEntry does NOT contain FirebaseDynamicLinks or DynamicLinks', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).not.toContain('FirebaseDynamicLinks')
    expect(result.content).not.toContain('DynamicLinks')
  })

  // Test 12: Supabase AppEntry contains @StateObject authManager
  it('Supabase AppEntry contains @StateObject private var authManager = AuthManager.shared', () => {
    const result = generateSdkInit('supabase')
    expect(result.content).toContain('@StateObject private var authManager = AuthManager.shared')
  })

  // Test 13: Supabase AppEntry contains isPasswordReset branch before auth guard
  it('Supabase AppEntry contains if authManager.isPasswordReset routing to NewPasswordView', () => {
    const result = generateSdkInit('supabase')
    expect(result.content).toContain('if authManager.isPasswordReset')
    expect(result.content).toContain('NewPasswordView()')
  })

  // Test 14: Supabase AppEntry contains auth guard
  it('Supabase AppEntry contains if authManager.isAuthenticated auth guard', () => {
    const result = generateSdkInit('supabase')
    expect(result.content).toContain('if authManager.isAuthenticated')
  })

  // Test 15: Supabase AppEntry contains .onOpenURL handler
  it('Supabase AppEntry contains .onOpenURL handler with supabase.auth.session(from: url)', () => {
    const result = generateSdkInit('supabase')
    expect(result.content).toContain('.onOpenURL')
    expect(result.content).toContain('supabase.auth.session(from: url)')
  })

  // Test 16: Both AppEntry templates still contain their original SDK init code
  it('both AppEntry templates still contain their original SDK init code', () => {
    const firebase = generateSdkInit('firebase')
    expect(firebase.content).toContain('FirebaseApp.configure()')

    const supabase = generateSdkInit('supabase')
    expect(supabase.content).toContain('SupabaseClient(')
  })

  // Test 17: Firebase AppEntry contains import FirebaseAuth
  it('Firebase AppEntry contains import FirebaseAuth', () => {
    const result = generateSdkInit('firebase')
    expect(result.content).toContain('import FirebaseAuth')
  })
})
