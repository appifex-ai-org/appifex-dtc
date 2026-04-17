// Phase 4 Wave-0 stub — FIRE-02: Firebase auth provider templates (Apple Sign In, Google Sign In).
// Bodies implemented in Phase 4 Plan 02 task execution.
import { describe, it } from 'vitest'

describe('firebase-auth templates (FIRE-02)', () => {
  it.todo('auth-manager template includes signInWithApple with SHA-256 hashed nonce using CryptoKit')
  it.todo('auth-manager template passes raw nonce (not hashed) to Firebase OAuthProvider.appleCredential')
  it.todo('auth-manager template includes signInWithGoogle using GIDSignIn')
  it.todo('login-view template places SignInWithAppleButton before Google Sign In button (Apple HIG order)')
  it.todo('login-view template includes a Divider between email/password block and SSO buttons')
  it.todo('patchProjectDependencies injects GoogleSignIn-iOS SPM package alongside firebase-ios-sdk')
  it.todo('patchProjectDependencies injects REVERSED_CLIENT_ID URL scheme via js-yaml (yaml.load/yaml.dump, no regex for URL scheme block)')
})
