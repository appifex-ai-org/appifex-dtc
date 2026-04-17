// Phase 4 (FIRE-04): Firebase provision integration tests.
// Uses vi.mock to stub firebase-admin and Runner — no real Firebase project needed.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFirebaseProvision } from '../src/firebase-provision.js'
import { ProvisionError } from '@appifex/core'

// Mock firebase-admin modules
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
  cert: vi.fn((path: string) => ({ path })),
  deleteApp: vi.fn().mockResolvedValue(undefined),
}))

const mockReleaseFirestoreRuleset = vi.fn().mockResolvedValue(undefined)
const mockCreateRuleset = vi.fn().mockResolvedValue({ name: 'ruleset/mock' })
const mockCreateRulesFileFromSource = vi.fn().mockReturnValue({})
vi.mock('firebase-admin/security-rules', () => ({
  getSecurityRules: vi.fn(() => ({
    createRulesFileFromSource: mockCreateRulesFileFromSource,
    createRuleset: mockCreateRuleset,
    releaseFirestoreRuleset: mockReleaseFirestoreRuleset,
  })),
}))

const mockDocSet = vi.fn().mockResolvedValue(undefined)
const mockDocRef = vi.fn(() => ({ set: mockDocSet }))
const mockCollection = vi.fn(() => ({ doc: mockDocRef }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

const VALID_RULES = `
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /todos/{docId} {
        allow read: if request.auth != null && request.auth.uid == resource.data.ownerId;
        allow write: if request.auth != null && request.auth.uid == resource.data.ownerId;
      }
      match /{document=**} { allow read, write: if false; }
    }
  }
`

function makeRunner(rulesContent = VALID_RULES): {
  readFile: ReturnType<typeof vi.fn>
  exec: ReturnType<typeof vi.fn>
} {
  return {
    readFile: vi.fn().mockResolvedValue(rulesContent),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  }
}

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
    entities: [
      { name: 'Todo', fields: [], relationships: [] },
      { name: 'User', fields: [], relationships: [] },
    ],
  },
}

describe('firebase-provision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply default mocks after clearAllMocks resets them
    mockReleaseFirestoreRuleset.mockResolvedValue(undefined)
    mockCreateRuleset.mockResolvedValue({ name: 'ruleset/mock' })
    mockCreateRulesFileFromSource.mockReturnValue({})
    mockDocSet.mockResolvedValue(undefined)
    mockDocRef.mockReturnValue({ set: mockDocSet })
    mockCollection.mockReturnValue({ doc: mockDocRef })
  })

  it('provisions a new Firebase project and returns projectId', async () => {
    const runner = makeRunner()
    const result = await runFirebaseProvision({ ...BASE_OPTS, runner, plistExists: false })
    expect(result.skipped).toBe(false)
    expect(result.projectId).toBe('test-project-123')
    expect(mockReleaseFirestoreRuleset).toHaveBeenCalledTimes(1)
  })

  it('registers an iOS app and returns iosAppId', async () => {
    const runner = makeRunner()
    const result = await runFirebaseProvision({ ...BASE_OPTS, runner, plistExists: false })
    expect(result.iosAppId).toBe('1:123456:ios:abcdef')
  })

  it('downloads GoogleService-Info.plist to the expected path', async () => {
    const runner = makeRunner()
    await runFirebaseProvision({ ...BASE_OPTS, runner, plistExists: false })
    // Verify the firebase-tools plist download call was made with correct args
    expect(runner.exec).toHaveBeenCalledWith('firebase', expect.arrayContaining([
      'apps:sdkconfig',
      'IOS',
      '1:123456:ios:abcdef',
      '--project',
      'test-project-123',
    ]))
  })

  it('idempotent: re-running with existing projectId skips project:create', async () => {
    const runner = makeRunner()
    const result = await runFirebaseProvision({ ...BASE_OPTS, runner, plistExists: true })
    expect(result.skipped).toBe(true)
    expect(mockReleaseFirestoreRuleset).not.toHaveBeenCalled()
  })

  it('throws ProvisionError when firebase-tools exits non-zero', async () => {
    const runner = { readFile: vi.fn().mockRejectedValue(new Error('ENOENT: file not found')), exec: vi.fn() }
    await expect(
      runFirebaseProvision({ ...BASE_OPTS, runner, plistExists: false }),
    ).rejects.toThrow(ProvisionError)
  })

  // Phase 4 Plan 07 (UI-SPEC destructive-action contract): overwritePlist=true bypasses idempotency
  it('overwrites the existing plist when overwritePlist=true is passed (UI-SPEC overwrite-confirm path)', async () => {
    const runner = makeRunner()
    const result = await runFirebaseProvision({
      ...BASE_OPTS,
      runner,
      plistExists: true,
      overwritePlist: true,
    })
    // Should NOT skip — must proceed through the full provision path
    expect(result.skipped).toBe(false)
    // releaseFirestoreRuleset must be called (rules deploy proceeds)
    expect(mockReleaseFirestoreRuleset).toHaveBeenCalledTimes(1)
    // firebase apps:sdkconfig must be called to refresh the plist
    expect(runner.exec).toHaveBeenCalledWith(
      'firebase',
      expect.arrayContaining(['apps:sdkconfig', 'IOS', '1:123456:ios:abcdef']),
    )
  })

  // Phase 4 Plan 07: plistExists=true without overwritePlist still skips (D-05 default-safe behavior preserved)
  it('preserves idempotency: plistExists=true with overwritePlist=false (or omitted) returns skipped=true', async () => {
    const runner = makeRunner()
    const result = await runFirebaseProvision({
      ...BASE_OPTS,
      runner,
      plistExists: true,
      overwritePlist: false,
    })
    expect(result.skipped).toBe(true)
    expect(runner.exec).not.toHaveBeenCalled()
  })
})
