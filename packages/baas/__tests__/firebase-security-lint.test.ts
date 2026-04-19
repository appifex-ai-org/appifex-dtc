// Phase 4 Wave-0 stubs — FIRE-05: two new hard-fail lint patterns added in Phase 4.
// Bodies implemented in Phase 4 Plan 05.
import { describe, it, expect, vi } from 'vitest'
import { lintSecurityRules } from '../src/security-lint.js'
import { runFirebaseProvision } from '../src/firebase-provision.js'
import { SecurityLintError } from '@appifex/core'

// Mock firebase-admin modules (same pattern as firebase-provision.test.ts)
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
  cert: vi.fn((path: string) => ({ path })),
  deleteApp: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('firebase-admin/security-rules', () => ({
  getSecurityRules: vi.fn(() => ({
    createRulesFileFromSource: vi.fn().mockReturnValue({}),
    createRuleset: vi.fn().mockResolvedValue({ name: 'ruleset/mock' }),
    releaseFirestoreRuleset: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ set: vi.fn().mockResolvedValue(undefined) })),
    })),
  })),
}))

const BASE_OPTS = {
  outputDir: '/fake/output',
  config: {
    firebase: {
      projectId: 'test-project-123',
      serviceAccountKeyPath: '/fake/service-account.json',
      iosAppId: '1:123456:ios:abcdef',
    },
  },
  baasSchema: {
    entities: [{ name: 'Todo', fields: [], relationships: [] }],
  },
  plistExists: false,
}

describe('lintSecurityRules — Phase 4 patterns (FIRE-05)', () => {
  it('hard-fails when rules allow cross-user reads without ownership check (request.auth.uid == resource.data.ownerId absent)', () => {
    const rules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null;
            allow write: if request.auth != null && request.auth.uid == resource.data.ownerId;
          }
          match /{document=**} { allow read, write: if false; }
        }
      }
    `
    const result = lintSecurityRules(rules)
    expect(result.passed).toBe(false)
    expect(
      result.violations.some((v) => v.includes('Cross-user read') || v.includes('ownership')),
    ).toBe(true)
  })

  it('hard-fails when rules are missing deny-all default (match /{document=**} allow read, write: if false)', () => {
    const rules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null && request.auth.uid == resource.data.ownerId;
            allow write: if request.auth != null && request.auth.uid == resource.data.ownerId;
          }
        }
      }
    `
    const result = lintSecurityRules(rules)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.includes('deny-all'))).toBe(true)
  })

  it('lint runs before firebase-admin deploys rules; failure throws SecurityLintError with violations list', async () => {
    const badRules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null;
          }
        }
      }
    `
    const runner = {
      readFile: vi.fn().mockResolvedValue(badRules),
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    }

    await expect(runFirebaseProvision({ ...BASE_OPTS, runner })).rejects.toThrow(SecurityLintError)
  })

  it('pipeline aborts and rules are never deployed when SecurityLintError is thrown', async () => {
    const badRules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null;
          }
        }
      }
    `
    const execMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    const runner = {
      readFile: vi.fn().mockResolvedValue(badRules),
      exec: execMock,
    }

    await expect(runFirebaseProvision({ ...BASE_OPTS, runner })).rejects.toThrow(SecurityLintError)

    // exec (firebase apps:sdkconfig) must never have been called
    expect(execMock).not.toHaveBeenCalled()
  })
})
