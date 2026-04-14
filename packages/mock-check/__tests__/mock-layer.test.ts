import { describe, it, expect, vi } from 'vitest'
import { checkMockLayer } from '@appifex/mock-check'
import { MOCK_CONTRACT_METHODS } from '@appifex/mock'
import { extractSwiftProtocolMethods } from '../src/signature-extract/swift.js'
import { extractKotlinInterfaceMethods } from '../src/signature-extract/kotlin.js'
import { extractTsInterfaceMethods } from '../src/signature-extract/react.js'
import type { Runner } from '@appifex/core'

// ── Mock Runner factory ──────────────────────────────────────────────────────

function mockRunner(files: Record<string, string> = {}): Runner {
  return {
    exec: vi.fn(),
    readFile: vi.fn((path: string) => Promise.resolve(files[path] ?? '')),
    writeFile: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn((pattern: string) => {
      // Determine extension from pattern
      let ext: string
      if (pattern.endsWith('.swift')) ext = '.swift'
      else if (pattern.endsWith('.kt')) ext = '.kt'
      else if (pattern.endsWith('.tsx')) ext = '.tsx'
      else ext = ''
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

// ── Swift source fixtures ────────────────────────────────────────────────────

const SWIFT_AUTH_MANAGER = `
// Sources/Auth/MockAuthManager.swift
protocol AuthManaging: ObservableObject {
    var isAuthenticated: Bool { get }
    func signIn(email: String, password: String) async throws
    func signUp(email: String, password: String) async throws
    func signOut() throws
    func sendPasswordReset(email: String) async throws
    func confirmPasswordReset(code: String, newPassword: String) async throws
    func fetchEntities(entityName: String) async throws -> [Any]
    func simulateError(error: String)
}

final class MockAuthManager: ObservableObject, AuthManaging {
    static let shared = MockAuthManager()
    @Published var isAuthenticated: Bool = true
    func signIn(email: String, password: String) async throws {}
    func signUp(email: String, password: String) async throws {}
    func signOut() throws {}
    func sendPasswordReset(email: String) async throws {}
    func confirmPasswordReset(code: String, newPassword: String) async throws {}
    func fetchEntities(entityName: String) async throws -> [Any] { return [] }
    func simulateError(error: String) {}
}
`

const SWIFT_REPOSITORY = `
// Sources/Data/UserRepository.swift
protocol UserRepositoryProtocol {
    func getAll() async throws -> [User]
    func save(item: User) async throws
}

class UserRepository: UserRepositoryProtocol {
    func getAll() async throws -> [User] { return [] }
    func save(item: User) async throws {}
}
`

const SWIFT_MOCK_REPOSITORY = `
// Sources/Data/MockUserRepository.swift
final class MockUserRepository: UserRepositoryProtocol {
    func getAll() async throws -> [User] { return [] }
    func save(item: User) async throws {}
}
`

// ── Kotlin source fixtures ───────────────────────────────────────────────────

const KOTLIN_AUTH_MANAGER = `
// app/src/main/java/auth/MockAuthManager.kt
interface AuthManagerInterface {
    val isAuthenticated: StateFlow<Boolean>
    suspend fun signIn(email: String, password: String)
    suspend fun signUp(email: String, password: String)
    fun signOut()
    suspend fun sendPasswordReset(email: String)
    suspend fun confirmPasswordReset(code: String, newPassword: String)
    suspend fun fetchEntities(entityName: String): List<Any>
    fun simulateError(error: String)
}

object MockAuthManager : AuthManagerInterface {
    override val isAuthenticated: StateFlow<Boolean> = MutableStateFlow(true)
    override suspend fun signIn(email: String, password: String) {}
    override suspend fun signUp(email: String, password: String) {}
    override fun signOut() {}
    override suspend fun sendPasswordReset(email: String) {}
    override suspend fun confirmPasswordReset(code: String, newPassword: String) {}
    override suspend fun fetchEntities(entityName: String): List<Any> = emptyList()
    override fun simulateError(error: String) {}
}
`

const KOTLIN_REPOSITORY = `
// app/src/main/java/data/UserRepository.kt
interface UserRepositoryInterface {
    suspend fun getAll(): List<User>
    suspend fun save(item: User)
}

class UserRepository : UserRepositoryInterface {
    override suspend fun getAll(): List<User> = emptyList()
    override suspend fun save(item: User) {}
}
`

const KOTLIN_MOCK_REPOSITORY = `
// app/src/main/java/data/MockUserRepository.kt
object MockUserRepository : UserRepositoryInterface {
    override suspend fun getAll(): List<User> = emptyList()
    override suspend fun save(item: User) {}
}
`

// ── React source fixtures ────────────────────────────────────────────────────

const REACT_AUTH_MANAGER = `
// src/services/MockAuthManager.tsx
export interface AuthContextValue {
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => void
  sendPasswordReset: (email: string) => Promise<void>
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>
  fetchEntities: (entityName: string) => Promise<any[]>
  simulateError: (error: string) => void
}

export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const signIn = async (email: string, password: string) => {}
  const signUp = async (email: string, password: string) => {}
  const signOut = () => {}
  const sendPasswordReset = async (email: string) => {}
  const confirmPasswordReset = async (code: string, newPassword: string) => {}
  const fetchEntities = async (entityName: string) => []
  const simulateError = (error: string) => {}
  return <div>{children}</div>
}
`

const REACT_DATA_SERVICE = `
// src/services/MockDataService.tsx
export interface DataServiceValue {
  getUsers: () => Promise<User[]>
}

export function MockDataServiceProvider({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
`

const REACT_REPOSITORY = `
// src/services/UserRepository.tsx
export interface UserRepositoryValue {
  getAll: () => Promise<User[]>
}

export function UserRepository() {
  return null
}
`

const REACT_MOCK_REPOSITORY = `
// src/services/MockUserRepository.tsx
export function MockUserRepository() {
  return null
}
`

// ── Tests: checkMockLayer ────────────────────────────────────────────────────

describe('checkMockLayer', () => {
  describe('all mocks present — no violations', () => {
    it('Swift: all mock files present returns allPassed true with no violations', async () => {
      const runner = mockRunner({
        '/project/Sources/Auth/MockAuthManager.swift': SWIFT_AUTH_MANAGER,
        '/project/Sources/Data/UserRepository.swift': SWIFT_REPOSITORY,
        '/project/Sources/Data/MockUserRepository.swift': SWIFT_MOCK_REPOSITORY,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.allPassed).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.platformsScanned).toContain('swiftui')
    })

    it('Kotlin: all mock files present returns allPassed true with no violations', async () => {
      const runner = mockRunner({
        '/project/app/auth/MockAuthManager.kt': KOTLIN_AUTH_MANAGER,
        '/project/app/data/UserRepository.kt': KOTLIN_REPOSITORY,
        '/project/app/data/MockUserRepository.kt': KOTLIN_MOCK_REPOSITORY,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.allPassed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('React: all mock files present returns allPassed true with no violations', async () => {
      const runner = mockRunner({
        '/project/src/MockAuthManager.tsx': REACT_AUTH_MANAGER,
        '/project/src/MockDataService.tsx': REACT_DATA_SERVICE,
        '/project/src/UserRepository.tsx': REACT_REPOSITORY,
        '/project/src/MockUserRepository.tsx': REACT_MOCK_REPOSITORY,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.allPassed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })

  describe('MISSING_MOCK violations', () => {
    it('Swift: MockAuthManager.swift missing returns MISSING_MOCK violation for swiftui platform', async () => {
      const runner = mockRunner({
        '/project/Sources/Data/UserRepository.swift': SWIFT_REPOSITORY,
        '/project/Sources/Data/MockUserRepository.swift': SWIFT_MOCK_REPOSITORY,
        // MockAuthManager.swift is absent
      })
      const result = await checkMockLayer(runner, '/project', {})
      const violations = result.violations.filter((v) => v.type === 'MISSING_MOCK')
      expect(violations.length).toBeGreaterThan(0)
      const authViolation = violations.find((v) => v.file.includes('MockAuthManager'))
      expect(authViolation).toBeDefined()
      expect(authViolation!.platform).toBe('swiftui')
      expect(authViolation!.entity).toBeUndefined()
    })

    it('Kotlin: MockUserRepository.kt missing returns MISSING_MOCK with entity User', async () => {
      const runner = mockRunner({
        '/project/app/auth/MockAuthManager.kt': KOTLIN_AUTH_MANAGER,
        '/project/app/data/UserRepository.kt': KOTLIN_REPOSITORY,
        // MockUserRepository.kt is absent
      })
      const result = await checkMockLayer(runner, '/project', {})
      const violations = result.violations.filter((v) => v.type === 'MISSING_MOCK')
      expect(violations.length).toBeGreaterThan(0)
      const repoViolation = violations.find((v) => v.entity === 'User')
      expect(repoViolation).toBeDefined()
      expect(repoViolation!.platform).toBe('kotlin-compose')
    })

    it('React: MockDataService.tsx missing returns MISSING_MOCK (mandatory for React)', async () => {
      const runner = mockRunner({
        '/project/src/MockAuthManager.tsx': REACT_AUTH_MANAGER,
        // MockDataService.tsx absent — mandatory for React (D-02)
      })
      const result = await checkMockLayer(runner, '/project', {})
      const violations = result.violations.filter((v) => v.type === 'MISSING_MOCK')
      const dsViolation = violations.find((v) => v.file.includes('MockDataService'))
      expect(dsViolation).toBeDefined()
      expect(dsViolation!.platform).toBe('react')
    })

    it('Kotlin: does NOT flag MISSING_MOCK for MockDataService.kt (no aggregator in Kotlin)', async () => {
      const runner = mockRunner({
        '/project/app/auth/MockAuthManager.kt': KOTLIN_AUTH_MANAGER,
        // No MockDataService.kt — should NOT be flagged
      })
      const result = await checkMockLayer(runner, '/project', {})
      const dsViolation = result.violations.find((v) => v.file.includes('MockDataService'))
      expect(dsViolation).toBeUndefined()
    })
  })

  describe('MISSING_METHOD violations', () => {
    it('Swift: MockAuthManager.swift missing signIn method returns MISSING_METHOD violation', async () => {
      const swiftAuthManagerMissingSignIn = `
protocol AuthManaging: ObservableObject {
    func signIn(email: String, password: String) async throws
    func signOut() throws
}

final class MockAuthManager: ObservableObject, AuthManaging {
    // signIn is deliberately missing from mock
    func signOut() throws {}
}
`
      const runner = mockRunner({
        '/project/Sources/Auth/MockAuthManager.swift': swiftAuthManagerMissingSignIn,
      })
      const result = await checkMockLayer(runner, '/project', {})
      const missing = result.violations.filter((v) => v.type === 'MISSING_METHOD')
      expect(missing.length).toBeGreaterThanOrEqual(5) // signIn + 5 others from contract
      expect(missing.map((v) => v.method)).toContain('signIn')
      expect(missing.map((v) => v.method)).toContain('sendPasswordReset')
    })

    it('Kotlin: MockAuthManager.kt missing signIn returns MISSING_METHOD', async () => {
      const kotlinMissingSignIn = `
interface AuthManagerInterface {
    suspend fun signIn(email: String, password: String)
    fun signOut()
}

object MockAuthManager : AuthManagerInterface {
    // signIn is deliberately missing
    override fun signOut() {}
}
`
      const runner = mockRunner({
        '/project/app/auth/MockAuthManager.kt': kotlinMissingSignIn,
      })
      const result = await checkMockLayer(runner, '/project', {})
      const missing = result.violations.filter((v) => v.type === 'MISSING_METHOD')
      expect(missing.length).toBeGreaterThanOrEqual(5) // signIn + 5 others from contract
      expect(missing.map((v) => v.method)).toContain('signIn')
      expect(missing.map((v) => v.method)).toContain('sendPasswordReset')
    })
  })

  describe('SIGNATURE_MISMATCH violations', () => {
    it('Kotlin: MockAuthManager signIn with wrong param types returns SIGNATURE_MISMATCH', async () => {
      const kotlinWrongParams = `
interface AuthManagerInterface {
    suspend fun signIn(email: String, password: String)
    fun signOut()
}

object MockAuthManager : AuthManagerInterface {
    override suspend fun signIn(username: Int, token: Boolean) {}
    override fun signOut() {}
}
`
      const runner = mockRunner({
        '/project/app/auth/MockAuthManager.kt': kotlinWrongParams,
      })
      const result = await checkMockLayer(runner, '/project', {})
      const violations = result.violations.filter((v) => v.type === 'SIGNATURE_MISMATCH')
      expect(violations.length).toBeGreaterThan(0)
      const mismatch = violations.find((v) => v.method === 'signIn')
      expect(mismatch).toBeDefined()
      expect(mismatch!.platform).toBe('kotlin-compose')
      expect(mismatch!.expected).toBeDefined()
      expect(mismatch!.actual).toBeDefined()
    })
  })

  describe('entity detection', () => {
    it('Swift: entity names derived from non-Mock *Repository.swift files', async () => {
      const runner = mockRunner({
        '/project/Sources/Data/UserRepository.swift': SWIFT_REPOSITORY,
        '/project/Sources/Data/ProductRepository.swift': `
protocol ProductRepositoryProtocol {
    func getAll() async throws -> [Product]
}
class ProductRepository: ProductRepositoryProtocol {
    func getAll() async throws -> [Product] { return [] }
}
`,
        '/project/Sources/Auth/MockAuthManager.swift': SWIFT_AUTH_MANAGER,
        '/project/Sources/Data/MockUserRepository.swift': SWIFT_MOCK_REPOSITORY,
        // MockProductRepository.swift is missing
      })
      const result = await checkMockLayer(runner, '/project', {})
      const productMissing = result.violations.find(
        (v) => v.entity === 'Product' && v.type === 'MISSING_MOCK',
      )
      expect(productMissing).toBeDefined()
      expect(productMissing!.platform).toBe('swiftui')
    })
  })

  describe('result shape', () => {
    it('filesScanned counts all platform files', async () => {
      const runner = mockRunner({
        '/project/Sources/Auth/MockAuthManager.swift': SWIFT_AUTH_MANAGER,
        '/project/app/auth/MockAuthManager.kt': KOTLIN_AUTH_MANAGER,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.filesScanned).toBe(2)
    })

    it('duration is a non-negative number', async () => {
      const runner = mockRunner({
        '/project/Sources/Auth/MockAuthManager.swift': SWIFT_AUTH_MANAGER,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('platformsScanned includes detected platforms', async () => {
      const runner = mockRunner({
        '/project/Sources/Auth/MockAuthManager.swift': SWIFT_AUTH_MANAGER,
        '/project/app/auth/MockAuthManager.kt': KOTLIN_AUTH_MANAGER,
        '/project/src/MockAuthManager.tsx': REACT_AUTH_MANAGER,
        '/project/src/MockDataService.tsx': REACT_DATA_SERVICE,
      })
      const result = await checkMockLayer(runner, '/project', {})
      expect(result.platformsScanned).toContain('swiftui')
      expect(result.platformsScanned).toContain('kotlin-compose')
      expect(result.platformsScanned).toContain('react')
    })
  })
})

// ── Tests: signature extractors ──────────────────────────────────────────────

describe('extractSwiftProtocolMethods', () => {
  it('extracts func signIn(email: String, password: String) from protocol block', () => {
    const source = `
protocol AuthManaging: ObservableObject {
    func signIn(email: String, password: String) async throws
    func signOut() throws
}

class SomeClass {
    func signIn(email: String, password: String) async throws {}
}
`
    const methods = extractSwiftProtocolMethods(source, 'AuthManaging')
    expect(methods).toHaveLength(2) // signIn and signOut
    const signIn = methods.find((m) => m.name === 'signIn')
    expect(signIn).toBeDefined()
    expect(signIn!.params).toEqual(['email: String', 'password: String'])
  })

  it('does NOT extract methods from class body (only from protocol block)', () => {
    const source = `
class SomeClass {
    func signIn(email: String, password: String) async throws {}
}
`
    const methods = extractSwiftProtocolMethods(source, 'AuthManaging')
    expect(methods).toHaveLength(0)
  })

  it('returns empty array when protocol not found', () => {
    const source = `
protocol OtherProtocol {
    func doSomething()
}
`
    const methods = extractSwiftProtocolMethods(source, 'AuthManaging')
    expect(methods).toHaveLength(0)
  })
})

describe('extractKotlinInterfaceMethods', () => {
  it('extracts suspend fun signIn(email: String, password: String) from interface block', () => {
    const source = `
interface AuthManagerInterface {
    val isAuthenticated: StateFlow<Boolean>
    suspend fun signIn(email: String, password: String)
    fun signOut()
}

class MockImpl : AuthManagerInterface {
    override suspend fun signIn(email: String, password: String) {}
}
`
    const methods = extractKotlinInterfaceMethods(source, 'AuthManagerInterface')
    expect(methods.length).toBeGreaterThan(0)
    const signIn = methods.find((m) => m.name === 'signIn')
    expect(signIn).toBeDefined()
    expect(signIn!.params).toEqual(['email: String', 'password: String'])
  })

  it('does not extract methods from class body outside interface block', () => {
    const source = `
class MockImpl {
    override suspend fun signIn(email: String, password: String) {}
}
`
    const methods = extractKotlinInterfaceMethods(source, 'AuthManagerInterface')
    expect(methods).toHaveLength(0)
  })
})

describe('extractTsInterfaceMethods', () => {
  it('extracts signIn: (email: string, password: string) => Promise<void> from interface block', () => {
    const source = `
export interface AuthContextValue {
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}
`
    const methods = extractTsInterfaceMethods(source, 'AuthContextValue')
    const signIn = methods.find((m) => m.name === 'signIn')
    expect(signIn).toBeDefined()
    expect(signIn!.params).toEqual(['email: string', 'password: string'])
  })

  it('returns empty array when interface not found', () => {
    const methods = extractTsInterfaceMethods('class Foo {}', 'AuthContextValue')
    expect(methods).toHaveLength(0)
  })
})

describe('contract enforcement — MOCK_CONTRACT_METHODS', () => {
  it('MOCK_CONTRACT_METHODS has exactly 7 methods', () => {
    // Guard against silent omission — if MockServiceContract grows,
    // this test must be updated alongside the constant
    expect(MOCK_CONTRACT_METHODS).toHaveLength(7)
  })

  it('Swift: missing contract methods produce MISSING_METHOD for each', async () => {
    // Protocol and mock only have signIn and signOut — 5 contract methods missing from mock
    const swiftMinimal = `
protocol AuthManaging: ObservableObject {
    func signIn(email: String, password: String) async throws
    func signOut() throws
}
final class MockAuthManager: ObservableObject, AuthManaging {
    func signIn(email: String, password: String) async throws {}
    func signOut() throws {}
}
`
    const runner = mockRunner({
      '/project/Sources/Auth/MockAuthManager.swift': swiftMinimal,
    })
    const result = await checkMockLayer(runner, '/project', {})
    const missing = result.violations.filter((v) => v.type === 'MISSING_METHOD')
    expect(missing.length).toBe(5) // signUp, sendPasswordReset, confirmPasswordReset, fetchEntities, simulateError
    expect(missing.map((v) => v.method)).toContain('sendPasswordReset')
    expect(missing.map((v) => v.method)).toContain('fetchEntities')
    expect(missing.map((v) => v.method)).not.toContain('signIn') // signIn IS present
    expect(missing.map((v) => v.method)).not.toContain('signOut') // signOut IS present
  })

  it('Kotlin: missing contract methods produce MISSING_METHOD for each', async () => {
    const ktMinimal = `
interface AuthManagerInterface {
    suspend fun signIn(email: String, password: String)
    fun signOut()
}
object MockAuthManager : AuthManagerInterface {
    override suspend fun signIn(email: String, password: String) {}
    override fun signOut() {}
}
`
    const runner = mockRunner({
      '/project/app/auth/MockAuthManager.kt': ktMinimal,
    })
    const result = await checkMockLayer(runner, '/project', {})
    const missing = result.violations.filter((v) => v.type === 'MISSING_METHOD')
    expect(missing.length).toBe(5)
    expect(missing.map((v) => v.method)).toContain('confirmPasswordReset')
    expect(missing.map((v) => v.method)).toContain('simulateError')
  })

  it('React: missing contract methods produce MISSING_METHOD for each', async () => {
    const reactMinimal = `
export interface AuthContextValue {
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const signIn = async (email: string, password: string) => {}
  const signOut = () => {}
  return <div>{children}</div>
}
`
    const runner = mockRunner({
      '/project/src/MockAuthManager.tsx': reactMinimal,
      '/project/src/MockDataService.tsx':
        'export function MockDataServiceProvider() { return null }',
    })
    const result = await checkMockLayer(runner, '/project', {})
    const missing = result.violations.filter((v) => v.type === 'MISSING_METHOD')
    expect(missing.length).toBe(5)
    expect(missing.map((v) => v.method)).toContain('signUp')
    expect(missing.map((v) => v.method)).toContain('fetchEntities')
  })
})
