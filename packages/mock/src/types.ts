/**
 * Canonical mock user type — Firebase/Supabase-compatible fields.
 * All three platforms (SwiftUI, Kotlin, React) must mirror these fields exactly.
 */
export interface MockUser {
  uid: string
  email: string
  displayName: string
  emailVerified: boolean
  isAnonymous: boolean
  photoURL: string | null
}

/**
 * Mock auth state — used by mock auth services across all platforms.
 */
export type MockAuthState =
  | { status: 'authenticated'; user: MockUser }
  | { status: 'unauthenticated' }
  | { status: 'loading' }

/**
 * The canonical mock user — shared across SwiftUI, Kotlin, and React.
 * Phase 35+ templates will reference these exact values.
 */
export const MOCK_USER: MockUser = {
  uid: 'mock-user-001',
  email: 'mock@example.com',
  displayName: 'Mock User',
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
}

/**
 * MockServiceContract -- required method surface for all platform mock implementations.
 * All three platforms (SwiftUI, Kotlin, React) must implement every method listed here.
 * Parity is enforced structurally: Eta templates reference this type at render time.
 */
export interface MockServiceContract {
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<void>
  signOut(): void
  sendPasswordReset(email: string): Promise<void>
  confirmPasswordReset(code: string, newPassword: string): Promise<void>
  fetchEntities<T>(entityName: string): Promise<T[]>
  simulateError(error: string): void
}

/**
 * Runtime-accessible list of all MockServiceContract method names.
 * `satisfies` ensures every element is a key of MockServiceContract —
 * adding a non-existent method name here is a compile error.
 * Completeness (all keys present) is enforced by tests in @appifex/mock-check.
 */
export const MOCK_CONTRACT_METHODS = [
  'signIn',
  'signUp',
  'signOut',
  'sendPasswordReset',
  'confirmPasswordReset',
  'fetchEntities',
  'simulateError',
] as const satisfies (keyof MockServiceContract)[]
