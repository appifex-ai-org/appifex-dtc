import { describe, it, expect, vi } from 'vitest'
import { checkBaasIntegration } from '@appifex/baas-check'
import type { Runner, BaasContext } from '@appifex/core'
import { createHash } from 'node:crypto'

// ── Mock Runner factory ──────────────────────────────────────────────────────

function mockRunner(files: Record<string, string> = {}): Runner {
  return {
    exec: vi.fn(),
    readFile: vi.fn((path: string) => Promise.resolve(files[path] ?? '')),
    writeFile: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn((pattern: string) => {
      const ext = pattern.endsWith('.swift') ? '.swift' : '.kt'
      return Promise.resolve(Object.keys(files).filter((f) => f.endsWith(ext)))
    }),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  } as Runner
}

// ── BaasContext fixture ──────────────────────────────────────────────────────

const firebaseBaasContext: BaasContext = {
  provider: 'firebase',
  recommendation: { tier: 'appropriate', reason: 'test' },
}

// ── DET-01: Missing imports ──────────────────────────────────────────────────

describe('checkBaasIntegration', () => {
  describe('DET-01: missing imports', () => {
    it('Swift file without import FirebaseAuth or import Firebase produces missing_import violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
class AuthManager {
  var user: User?
  func signIn() {}
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_import')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthManager.swift')
      expect(violations[0].platform).toBe('swiftui')
      expect(violations[0].type).toBe('missing_import')
      expect(violations[0].expected).toContain('import FirebaseAuth')
      expect(violations[0].remediation).toBeTruthy()
    })

    it('Swift file with import FirebaseAuth produces no missing_import violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
import FirebaseAuth

class AuthManager {
  func signIn() {
    Auth.auth().signIn(withEmail: "a@b.com", password: "pw") { _, _ in }
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_import')
      expect(violations).toHaveLength(0)
    })

    it('Swift file with import Firebase (base package) produces no missing_import violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
import Firebase

class AuthManager {}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_import')
      expect(violations).toHaveLength(0)
    })

    it('Kotlin file without import com.google.firebase.auth.FirebaseAuth produces missing_import violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.kt': `
class AuthManager {
    fun signIn() {}
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_import')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthManager.kt')
      expect(violations[0].platform).toBe('kotlin-compose')
      expect(violations[0].type).toBe('missing_import')
    })

    it('Kotlin file with import com.google.firebase.auth.FirebaseAuth produces no missing_import violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.kt': `
import com.google.firebase.auth.FirebaseAuth

class AuthManager {
    fun signIn() {
        val auth = FirebaseAuth.getInstance()
    }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_import')
      expect(violations).toHaveLength(0)
    })
  })

  // ── DET-02: Facade detection ─────────────────────────────────────────────

  describe('DET-02: facade detection', () => {
    it('Swift: isAuthenticated = true + no Auth.auth() -> facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.swift': `
import FirebaseAuth

class AuthViewModel {
  var isAuthenticated = true
  func currentUser() -> User? { return nil }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthViewModel.swift')
      expect(violations[0].platform).toBe('swiftui')
      expect(violations[0].matched).toContain('isAuthenticated')
      expect(violations[0].expected).toContain('Auth.auth()')
      expect(violations[0].remediation).toContain('hardcoded isAuthenticated = true')
    })

    it('Swift: isAuthenticated = true + Auth.auth() present -> no facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.swift': `
import FirebaseAuth

class AuthViewModel {
  var isAuthenticated = true
  func signIn() {
    Auth.auth().signIn(withEmail: "a@b.com", password: "pw") { _, _ in }
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(0)
    })

    it('Swift: no facade signals at all -> no facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/ProfileView.swift': `
import FirebaseAuth

struct ProfileView: View {
  var body: some View {
    Text("Hello")
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(0)
    })

    it('Kotlin: isAuthenticated = true + no FirebaseAuth.getInstance() -> facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.kt': `
import com.google.firebase.auth.FirebaseAuth

class AuthViewModel {
    var isAuthenticated = true
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthViewModel.kt')
      expect(violations[0].platform).toBe('kotlin-compose')
    })

    it('Kotlin: isAuthenticated = true + FirebaseAuth.getInstance() present -> no facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.kt': `
import com.google.firebase.auth.FirebaseAuth

class AuthViewModel {
    var isAuthenticated = true
    val auth = FirebaseAuth.getInstance()
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(0)
    })
  })

  // ── DET-03: Comment stripping ────────────────────────────────────────────

  describe('DET-03: comment stripping', () => {
    it('Swift: // Auth.auth() in comment + isAuthenticated = true -> facade_auth (commented call does not count)', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.swift': `
import FirebaseAuth

class AuthViewModel {
  var isAuthenticated = true
  // TODO: replace with real auth: Auth.auth()
  func signIn() {}
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(1)
      expect(violations[0].matched).toContain('isAuthenticated')
    })

    it('Swift: /* Auth.auth() */ in block comment + facade signal -> facade_auth violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.swift': `
import FirebaseAuth

class AuthViewModel {
  var isAuthenticated = true
  /* Auth.auth() was here but removed */
  func signIn() {}
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(1)
    })

    it('Swift: real Auth.auth() (not in comment) + facade signal -> no violation', async () => {
      const runner = mockRunner({
        '/project/AuthViewModel.swift': `
import FirebaseAuth

class AuthViewModel {
  var isAuthenticated = true
  // Old implementation: Auth.auth() was here
  func signIn() {
    Auth.auth().signIn(withEmail: "a@b.com", password: "pw") { result, error in }
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'facade_auth')
      expect(violations).toHaveLength(0)
    })
  })

  // ── DET-04: Template overwrite detection ─────────────────────────────────

  describe('DET-04: template overwrite', () => {
    it('wiringMetadata with templateHashes, content changed -> template_overwritten violation', async () => {
      const originalContent = 'import FirebaseAuth\nclass AuthManager {}'
      const modifiedContent =
        'import FirebaseAuth\nclass AuthManager { var isAuthenticated = true }'
      const originalHash = createHash('sha256').update(originalContent).digest('hex')

      const runner = mockRunner({
        '/project/AuthManager.swift': modifiedContent,
      })

      const baasContext: BaasContext = {
        ...firebaseBaasContext,
        wiringMetadata: {
          templateHashes: {
            'AuthManager.swift': originalHash,
          },
        },
      }

      const result = await checkBaasIntegration(runner, '/project', baasContext)

      const violations = result.violations.filter((v) => v.type === 'template_overwritten')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthManager.swift')
      expect(violations[0].type).toBe('template_overwritten')
      expect(violations[0].expected).toContain('template hash')
      expect(violations[0].remediation).toContain('template')
    })

    it('wiringMetadata with templateHashes, content matches -> no violation', async () => {
      const content = 'import FirebaseAuth\nclass AuthManager {}'
      const hash = createHash('sha256').update(content).digest('hex')

      const runner = mockRunner({
        '/project/AuthManager.swift': content,
      })

      const baasContext: BaasContext = {
        ...firebaseBaasContext,
        wiringMetadata: {
          templateHashes: {
            'AuthManager.swift': hash,
          },
        },
      }

      const result = await checkBaasIntegration(runner, '/project', baasContext)

      const violations = result.violations.filter((v) => v.type === 'template_overwritten')
      expect(violations).toHaveLength(0)
    })

    it('wiringMetadata undefined -> no violation, no error', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': 'import FirebaseAuth\nclass AuthManager {}',
      })

      const baasContext: BaasContext = {
        ...firebaseBaasContext,
        wiringMetadata: undefined,
      }

      await expect(checkBaasIntegration(runner, '/project', baasContext)).resolves.not.toThrow()

      const result = await checkBaasIntegration(runner, '/project', baasContext)
      const violations = result.violations.filter((v) => v.type === 'template_overwritten')
      expect(violations).toHaveLength(0)
    })

    it('wiringMetadata with no templateHashes key -> no violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': 'import FirebaseAuth\nclass AuthManager {}',
      })

      const baasContext: BaasContext = {
        ...firebaseBaasContext,
        wiringMetadata: { someOtherKey: 'value' },
      }

      const result = await checkBaasIntegration(runner, '/project', baasContext)
      const violations = result.violations.filter((v) => v.type === 'template_overwritten')
      expect(violations).toHaveLength(0)
    })

    it('template file deleted (empty content from readFile) -> template_overwritten violation', async () => {
      const originalHash = createHash('sha256')
        .update('import FirebaseAuth\nclass AuthManager {}')
        .digest('hex')

      // File exists in glob but readFile returns empty string (deleted/empty)
      const runner = mockRunner({
        '/project/AuthManager.swift': '',
      })

      const baasContext: BaasContext = {
        ...firebaseBaasContext,
        wiringMetadata: {
          templateHashes: {
            'AuthManager.swift': originalHash,
          },
        },
      }

      const result = await checkBaasIntegration(runner, '/project', baasContext)

      const violations = result.violations.filter((v) => v.type === 'template_overwritten')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthManager.swift')
    })
  })

  // ── Result shape ─────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('allPassed is true when no violations', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
import FirebaseAuth

class AuthManager {
  func signIn() {
    Auth.auth().signIn(withEmail: "a@b.com", password: "pw") { _, _ in }
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)
      expect(result.allPassed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('allPassed is false when violations exist', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
class AuthManager {
  var isAuthenticated = true
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)
      expect(result.allPassed).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
    })

    it('filesScanned counts all .swift and .kt files', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': 'import FirebaseAuth\nclass AuthManager {}',
        '/project/ProfileView.swift': 'import FirebaseAuth\nstruct ProfileView {}',
        '/project/AuthViewModel.kt':
          'import com.google.firebase.auth.FirebaseAuth\nclass AuthViewModel {}',
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)
      expect(result.filesScanned).toBe(3)
    })

    it('duration is a positive number', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': 'import FirebaseAuth\nclass AuthManager {}',
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe('number')
    })

    it('violation file paths are relative (not absolute)', async () => {
      const runner = mockRunner({
        '/project/src/auth/AuthManager.swift': `
class AuthManager {
  var isAuthenticated = true
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)
      expect(result.violations.length).toBeGreaterThan(0)
      for (const v of result.violations) {
        expect(v.file).not.toMatch(/^\//)
        expect(v.file).toBe('src/auth/AuthManager.swift')
      }
    })
  })

  // ── missing_sdk_call ─────────────────────────────────────────────────────

  describe('missing_sdk_call', () => {
    it('Swift file with import Firebase, no facade signal, no Auth.auth() -> missing_sdk_call violation', async () => {
      const runner = mockRunner({
        '/project/AuthManager.swift': `
import FirebaseAuth

class AuthManager {
  func currentUser() -> User? {
    return nil
  }
}`,
      })

      const result = await checkBaasIntegration(runner, '/project', firebaseBaasContext)

      const violations = result.violations.filter((v) => v.type === 'missing_sdk_call')
      expect(violations).toHaveLength(1)
      expect(violations[0].file).toBe('AuthManager.swift')
      expect(violations[0].platform).toBe('swiftui')
      expect(violations[0].type).toBe('missing_sdk_call')
    })
  })
})
