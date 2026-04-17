// Phase 5 Plan 02 Task 1 (TF-03 D-06/D-07): type-level assertion that ArchiveOpts and
// ArchiveResult carry the marketingVersion + buildNumber fields Plan 04 populates.
//
// This is a TDD RED test: before Task 1's type extension it fails tsc --noEmit because
// the fields don't exist on ArchiveOpts / ArchiveResult. After Task 1 it compiles clean.

import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ArchiveOpts, ArchiveResult } from '../src/types.js'

describe('ArchiveOpts / ArchiveResult type shape (Task 1)', () => {
  it('ArchiveOpts exposes marketingVersion + buildNumber as string fields', () => {
    expectTypeOf<ArchiveOpts>().toHaveProperty('marketingVersion').toEqualTypeOf<string>()
    expectTypeOf<ArchiveOpts>().toHaveProperty('buildNumber').toEqualTypeOf<string>()
  })

  it('ArchiveResult echoes marketingVersion + buildNumber as string fields', () => {
    expectTypeOf<ArchiveResult>().toHaveProperty('marketingVersion').toEqualTypeOf<string>()
    expectTypeOf<ArchiveResult>().toHaveProperty('buildNumber').toEqualTypeOf<string>()
  })

  it('an ArchiveOpts value can be constructed with the new required fields', () => {
    const opts: ArchiveOpts = {
      projectDir: '/proj',
      teamId: 'TEAM123',
      bundleId: 'com.example.App',
      marketingVersion: '1.0.3',
      buildNumber: '47',
    }
    expect(opts.marketingVersion).toBe('1.0.3')
    expect(opts.buildNumber).toBe('47')
  })
})
