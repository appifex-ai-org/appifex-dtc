/** Firebase Auth detection patterns for Swift/SwiftUI (per D-03, D-04, D-06). */

export const REQUIRED_IMPORTS: RegExp[] = [
  /import\s+FirebaseAuth/,
  /import\s+Firebase\b/,
]

export const REAL_AUTH_CALLS: RegExp[] = [
  /Auth\.auth\(\)/,
]

export const FACADE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /isAuthenticated\s*=\s*true/, description: 'hardcoded isAuthenticated = true' },
  { pattern: /isLoggedIn\s*=\s*true/, description: 'hardcoded isLoggedIn = true' },
  { pattern: /MockUser|FakeUser|DummyUser/, description: 'mock user construction' },
]
