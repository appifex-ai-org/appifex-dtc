/** Firebase Auth detection patterns for Kotlin/Compose (per D-03, D-05, D-06). */

export const REQUIRED_IMPORTS: RegExp[] = [
  /import\s+com\.google\.firebase\.auth\.FirebaseAuth/,
]

export const REAL_AUTH_CALLS: RegExp[] = [
  /FirebaseAuth\.getInstance\(\)/,
]

export const FACADE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /isAuthenticated\s*=\s*true/, description: 'hardcoded isAuthenticated = true' },
  { pattern: /isLoggedIn\s*=\s*true/, description: 'hardcoded isLoggedIn = true' },
  { pattern: /MockUser|FakeUser|DummyUser/, description: 'mock user construction' },
]
