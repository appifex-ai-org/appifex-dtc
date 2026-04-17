import { describe, it, expect } from 'vitest'
import { lintSecurityRules } from '../src/security-lint.js'

describe('lintSecurityRules', () => {
  // Test 1: passes on valid owner-only Firestore rules
  it('passes on valid owner-only Firestore rules', () => {
    const validRules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null && request.auth.uid == resource.data.ownerId;
            allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerId;
            allow update: if request.auth != null && request.auth.uid == resource.data.ownerId;
            allow delete: if request.auth != null && request.auth.uid == resource.data.ownerId;
          }
        }
      }
    `
    const result = lintSecurityRules(validRules)
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // Test 2: fails on `allow read, write: if true`
  it('fails on allow read, write: if true', () => {
    const badRules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read, write: if true;
          }
        }
      }
    `
    const result = lintSecurityRules(badRules)
    expect(result.passed).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  // Test 3: fails on DISABLE ROW LEVEL SECURITY (case insensitive)
  it('fails on DISABLE ROW LEVEL SECURITY (case insensitive)', () => {
    const badRls = `ALTER TABLE todos Disable Row Level Security;`
    const result = lintSecurityRules(badRls)
    expect(result.passed).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  // Test 4: returns violations array with pattern description
  it('returns violations array with pattern description', () => {
    const badRules = `allow read, write: if true;`
    const result = lintSecurityRules(badRules)
    expect(result.violations[0]).toContain('Banned pattern detected')
    expect(result.violations[0]).toContain('open-access')
  })

  // Test 5: passes on valid Supabase RLS with auth.uid() checks
  it('passes on valid Supabase RLS with auth.uid() checks', () => {
    const validRls = `
      ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "todos_select_policy"
        ON todos FOR SELECT
        USING ((select auth.uid()) = user_id);
      CREATE POLICY "todos_insert_policy"
        ON todos FOR INSERT
        WITH CHECK ((select auth.uid()) = user_id);
    `
    const result = lintSecurityRules(validRls)
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // Test 6: fails on `allow read, write: if true` with extra whitespace variants
  it('fails on allow read, write: if true with extra whitespace variants', () => {
    const spacey = `allow  read ,  write :  if  true;`
    const result = lintSecurityRules(spacey)
    expect(result.passed).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  // Test 7: fails on allow read without ownerId ownership check (D-12 cross-user read pattern)
  it('fails on allow read without ownerId ownership check', () => {
    const rules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null;
          }
          match /{document=**} { allow read, write: if false; }
        }
      }
    `
    const result = lintSecurityRules(rules)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.includes('Cross-user read'))).toBe(true)
  })

  // Test 8: passes when allow read includes request.auth.uid == resource.data.ownerId
  it('passes when allow read includes request.auth.uid == resource.data.ownerId', () => {
    const rules = `
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
    const result = lintSecurityRules(rules)
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  // Test 9: fails when deny-all default match block is missing
  it('fails when deny-all default match block is missing', () => {
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

  // Test 10: passes on complete rules with ownership check and deny-all default
  it('passes on complete rules with ownership check and deny-all default', () => {
    const rules = `
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /todos/{docId} {
            allow read: if request.auth != null && request.auth.uid == resource.data.ownerId;
            allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerId;
            allow update: if request.auth != null && request.auth.uid == resource.data.ownerId;
            allow delete: if request.auth != null && request.auth.uid == resource.data.ownerId;
          }
          match /{document=**} { allow read, write: if false; }
        }
      }
    `
    const result = lintSecurityRules(rules)
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})
