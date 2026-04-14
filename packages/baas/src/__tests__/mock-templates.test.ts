import { describe, it, expect, beforeAll } from 'vitest'
import { renderBaasTemplates } from '../render-templates.js'
import type { GeneratedFile } from '../render-templates.js'
import { generateAuthTemplates } from '../auth-templates.js'
import { generateDataServices } from '../data-services.js'
import { generateSdkInit } from '../sdk-init.js'
import { generateConfigStubs } from '../config-stubs.js'
import { generateAuthDeepLinkConfig } from '../auth-deep-link.js'

const MOCK_SCHEMA = {
  entities: [{
    name: 'Task',
    fields: [
      { name: 'title', type: 'string' },
      { name: 'completed', type: 'boolean' },
      { name: 'priority', type: 'number' },
    ],
  }],
}

describe('mock provider guards', () => {
  it('generateSdkInit returns no-op comment for mock', () => {
    const result = generateSdkInit('mock')
    expect(result.content).toContain('mock provider')
  })

  it('generateConfigStubs returns empty array for mock', () => {
    expect(generateConfigStubs('mock')).toEqual([])
  })

  it('generateAuthDeepLinkConfig returns empty array for mock', () => {
    expect(generateAuthDeepLinkConfig('mock')).toEqual([])
  })

  it('renderBaasTemplates with mock returns Mock-prefixed repository files', () => {
    const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock')
    expect(result.length).toBeGreaterThan(0)
    const swiftRepo = result.find(f => f.path.includes('MockTaskRepository.swift'))
    expect(swiftRepo).toBeDefined()
  })

  it('generateAuthTemplates with mock returns Mock-prefixed auth files', () => {
    const result = generateAuthTemplates('mock', ['swift', 'kotlin'], MOCK_SCHEMA as any)
    expect(result.length).toBeGreaterThan(0)
    const swiftAuth = result.find(f => f.path.includes('MockAuthManager.swift'))
    expect(swiftAuth).toBeDefined()
  })
})

describe('mock auth templates (MAUTH-01, MAUTH-02, MAUTH-03)', () => {
  let authFiles: GeneratedFile[]

  beforeAll(() => {
    authFiles = generateAuthTemplates('mock', ['swift', 'kotlin'], MOCK_SCHEMA as any)
  })

  it('MockAuthManager Swift template contains isAuthenticated=true and MOCK_USER fields (MAUTH-01)', () => {
    const swiftAuth = authFiles.find(f => f.path.includes('MockAuthManager.swift'))
    expect(swiftAuth).toBeDefined()
    expect(swiftAuth!.content).toContain('isAuthenticated: Bool = true')
    expect(swiftAuth!.content).toContain('mock-user-001')
    expect(swiftAuth!.content).toContain('mock@example.com')
    expect(swiftAuth!.content).toContain('Mock User')
  })

  it('MockAuthManager Swift template contains simulateError method (MAUTH-03)', () => {
    const swiftAuth = authFiles.find(f => f.path.includes('MockAuthManager.swift'))
    expect(swiftAuth).toBeDefined()
    expect(swiftAuth!.content).toContain('simulateError')
    expect(swiftAuth!.content).toContain('MockAuthError')
  })

  it('Auth screen templates reference MockAuthManager.shared not AuthManager.shared (MAUTH-02)', () => {
    const loginView = authFiles.find(f => f.path.includes('LoginView.swift'))
    expect(loginView).toBeDefined()
    expect(loginView!.content).toContain('MockAuthManager.shared')
    expect(loginView!.content).not.toMatch(/[^k]AuthManager\.shared/) // no bare AuthManager.shared
  })
})

describe('mock repository templates (MAPI-01, MAPI-02, MAPI-03)', () => {
  let repoFiles: GeneratedFile[]

  beforeAll(() => {
    repoFiles = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['swift', 'kotlin'])
  })

  it('MockRepository template renders with seed data from entity fields (MAPI-01)', () => {
    const swiftRepo = repoFiles.find(f => f.path.includes('MockTaskRepository.swift'))
    expect(swiftRepo).toBeDefined()
    expect(swiftRepo!.content).toContain('mock-task-001')
    expect(swiftRepo!.content).toContain('mock-user-001')
  })

  it('MockRepository template contains simulateError method (MAPI-03)', () => {
    const swiftRepo = repoFiles.find(f => f.path.includes('MockTaskRepository.swift'))
    expect(swiftRepo).toBeDefined()
    expect(swiftRepo!.content).toContain('simulateError')
    expect(swiftRepo!.content).toContain('MockApiError')
  })

  it('Seed data field names match entity schema fields (MAPI-02)', () => {
    const swiftRepo = repoFiles.find(f => f.path.includes('MockTaskRepository.swift'))
    expect(swiftRepo).toBeDefined()
    // Entity has fields: title (string), completed (boolean), priority (number)
    expect(swiftRepo!.content).toContain('title:')
    expect(swiftRepo!.content).toContain('completed:')
    expect(swiftRepo!.content).toContain('priority:')
  })
})

describe('mock service wiring (FOUND-03, FOUND-04)', () => {
  it('ServiceConfiguration template generates for mock provider (FOUND-03)', () => {
    const authFiles = generateAuthTemplates('mock', ['swift', 'kotlin'], MOCK_SCHEMA as any)
    const svcConfig = authFiles.find(f => f.path.includes('ServiceConfiguration.swift'))
    expect(svcConfig).toBeDefined()
    expect(svcConfig!.content).toContain('ServiceConfiguration')
  })

  it('ServiceConfiguration template contains factory methods per entity (FOUND-04)', () => {
    const authFiles = generateAuthTemplates('mock', ['swift', 'kotlin'], MOCK_SCHEMA as any)
    const svcConfig = authFiles.find(f => f.path.includes('ServiceConfiguration.swift'))
    expect(svcConfig).toBeDefined()
    expect(svcConfig!.content).toContain('makeTaskRepository')
    expect(svcConfig!.content).toContain('MockTaskRepository')
    expect(svcConfig!.content).toContain('makeAuthManager')
    expect(svcConfig!.content).toContain('MockAuthManager.shared')
  })
})

describe('React mock templates (MAUTH-04, MAPI-04, PROV-03)', () => {
  it('renderBaasTemplates with mock+react produces React repository', () => {
    const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['react'])
    const reactRepo = result.find(f => f.path === 'src/services/MockTaskRepository.tsx')
    expect(reactRepo).toBeDefined()
    expect(reactRepo!.content).toContain('createMockTaskRepository')
    expect(reactRepo!.content).toContain('mock-user-001')
  })

  it('generateAuthTemplates with mock+react produces all React files', () => {
    const result = generateAuthTemplates('mock', ['react'], MOCK_SCHEMA as any)
    expect(result.find(f => f.path === 'src/services/MockAuthManager.tsx')).toBeDefined()
    expect(result.find(f => f.path === 'src/pages/auth/LoginPage.tsx')).toBeDefined()
    expect(result.find(f => f.path === 'src/pages/auth/SignupPage.tsx')).toBeDefined()
    expect(result.find(f => f.path === 'src/pages/auth/ResetPasswordPage.tsx')).toBeDefined()
    expect(result.find(f => f.path === 'src/pages/auth/NewPasswordPage.tsx')).toBeDefined()
    expect(result.find(f => f.path === 'src/services/ServiceConfiguration.tsx')).toBeDefined()
  })

  it('generateDataServices with mock+react produces MockDataService', () => {
    const result = generateDataServices(MOCK_SCHEMA as any, 'mock', ['react'])
    const ds = result.find(f => f.path === 'src/services/MockDataService.tsx')
    expect(ds).toBeDefined()
    expect(ds!.content).toContain('MockDataProvider')
  })

  it('React MockAuthManager contains canonical MOCK_USER values (PROV-03)', () => {
    const result = generateAuthTemplates('mock', ['react'], MOCK_SCHEMA as any)
    const authMgr = result.find(f => f.path === 'src/services/MockAuthManager.tsx')!
    expect(authMgr.content).toContain('mock-user-001')
    expect(authMgr.content).toContain('mock@example.com')
    expect(authMgr.content).toContain('Mock User')
  })

  it('React MockRepository contains seed data with mock-user-001 ownerId', () => {
    const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['react'])
    const reactRepo = result.find(f => f.path === 'src/services/MockTaskRepository.tsx')!
    expect(reactRepo.content).toContain('mock-user-001')
  })

  it('React auth screens contain useAuth import', () => {
    const result = generateAuthTemplates('mock', ['react'])
    const login = result.find(f => f.path.includes('LoginPage.tsx'))!
    expect(login.content).toContain('useAuth')
  })

  it('Cross-platform mock generates files for all three platforms', () => {
    const repos = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['swift', 'kotlin', 'react'])
    expect(repos.find(f => f.path.includes('MockTaskRepository.swift'))).toBeDefined()
    expect(repos.find(f => f.path.includes('MockTaskRepository.kt'))).toBeDefined()
    expect(repos.find(f => f.path.includes('MockTaskRepository.tsx'))).toBeDefined()
  })
})

describe('test integration templates (TEST-01, TEST-02, TEST-03, TEST-04)', () => {
  // Auth test file generation
  describe('auth test templates (TEST-01, TEST-02, TEST-03)', () => {
    it('Swift auth test template is generated with injectable MockAuthManager (TEST-01)', () => {
      const result = generateAuthTemplates('mock', ['swift'], MOCK_SCHEMA as any)
      const testFile = result.find(f => f.path === 'Tests/Auth/MockAuthManagerTests.swift')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('MockAuthManager()')  // direct instantiation, not .shared
      expect(testFile!.content).toContain('testSignInSetsAuthenticated')
    })

    it('Kotlin auth test template is generated with resetForTesting (TEST-03)', () => {
      const result = generateAuthTemplates('mock', ['kotlin'], MOCK_SCHEMA as any)
      const testFile = result.find(f => f.path === 'app/src/test/java/auth/MockAuthManagerTest.kt')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('resetForTesting')
      expect(testFile!.content).toContain('runTest')
    })

    it('React auth test template is generated with simulateError (TEST-02)', () => {
      const result = generateAuthTemplates('mock', ['react'], MOCK_SCHEMA as any)
      const testFile = result.find(f => f.path === 'src/__tests__/MockAuthManager.test.tsx')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('simulateError')
      expect(testFile!.content).toContain('MockAuthProvider')
    })

    it('Swift auth test template covers error simulation (TEST-02)', () => {
      const result = generateAuthTemplates('mock', ['swift'], MOCK_SCHEMA as any)
      const testFile = result.find(f => f.path === 'Tests/Auth/MockAuthManagerTests.swift')!
      expect(testFile.content).toContain('testSimulateError')
      expect(testFile.content).toContain('testErrorClearsAfterOneUse')
    })
  })

  // Repository test file generation
  describe('repository test templates (TEST-01)', () => {
    it('Swift repository test is generated per entity', () => {
      const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['swift'])
      const testFile = result.find(f => f.path === 'Tests/Repositories/MockTaskRepositoryTests.swift')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('MockTaskRepository')
    })

    it('Kotlin repository test is generated per entity', () => {
      const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['kotlin'])
      const testFile = result.find(f => f.path === 'app/src/test/java/repositories/MockTaskRepositoryTest.kt')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('MockTaskRepository')
    })

    it('React repository test is generated without React dependencies', () => {
      const result = renderBaasTemplates(MOCK_SCHEMA as any, 'mock', ['react'])
      const testFile = result.find(f => f.path === 'src/__tests__/MockTaskRepository.test.tsx')
      expect(testFile).toBeDefined()
      expect(testFile!.content).toContain('createMockTaskRepository')
      expect(testFile!.content).not.toContain('@testing-library/react')
    })
  })

  // Preview wrapper generation
  describe('preview wrapper templates (TEST-04)', () => {
    it('SwiftUI preview covers all 4 auth screens', () => {
      const result = generateAuthTemplates('mock', ['swift'], MOCK_SCHEMA as any)
      const preview = result.find(f => f.path === 'Sources/Auth/Previews/AuthPreviews.swift')
      expect(preview).toBeDefined()
      expect(preview!.content).toContain('#Preview')
      expect(preview!.content).toContain('Login screen')
      expect(preview!.content).toContain('Signup screen')
      expect(preview!.content).toContain('Reset password screen')
      expect(preview!.content).toContain('New password screen')
    })

    it('Compose preview covers all 4 auth screens', () => {
      const result = generateAuthTemplates('mock', ['kotlin'], MOCK_SCHEMA as any)
      const preview = result.find(f => f.path === 'app/src/main/java/auth/previews/AuthPreviews.kt')
      expect(preview).toBeDefined()
      expect(preview!.content).toContain('@Preview')
      expect(preview!.content).toContain('showBackground = true')
      expect(preview!.content).toContain('Login screen')
    })

    it('React test harness exports AuthTestHarness with ServiceConfiguration', () => {
      const result = generateAuthTemplates('mock', ['react'], MOCK_SCHEMA as any)
      const harness = result.find(f => f.path === 'src/previews/AuthTestHarness.tsx')
      expect(harness).toBeDefined()
      expect(harness!.content).toContain('AuthTestHarness')
      expect(harness!.content).toContain('ServiceConfiguration')
    })
  })

  // Guard: non-mock providers do NOT get test/preview files
  describe('mock-only guard', () => {
    it('firebase provider does not generate test or preview files', () => {
      const result = generateAuthTemplates('firebase', ['swift'], MOCK_SCHEMA as any)
      expect(result.find(f => f.path.includes('Tests/'))).toBeUndefined()
      expect(result.find(f => f.path.includes('Previews/'))).toBeUndefined()
    })
  })
})
