// Phase 7 (DESIGN-04): Wave 0 RED stub — see 07-VALIDATION.md
// Wave 2: wires in committed fixtures from packages/design/__tests__/fixtures/parity/
// Unskip in Plan 04 when binary fixtures and fixture-gen.ts are committed.
import { describe, it } from 'vitest'
import { readFile } from 'node:fs/promises'

// Force RED at module-resolution time: sanitizeLayerName does not exist yet.
// @ts-expect-error — module does not exist yet; RED until Plan 01 creates packages/design/src/sanitize.ts
import { sanitizeLayerName } from '@appifex/design' // eslint-disable-line @typescript-eslint/no-unused-vars

void readFile // referenced to avoid unused import lint
void sanitizeLayerName // referenced to ensure RED import is exercised

describe('adapter-parity (DESIGN-04)', () => {
  // Full parity test lives in packages/spec/__tests__/adapter-parity.test.ts (revision B-02).
  // This file serves as the Wave-0 filename anchor for VALIDATION.md traceability.

  it.todo(
    'all four adapters produce structurally equivalent IR from Pencil-authoritative fixture',
  )

  // Unskip in Plan 04 when fixtures/parity/ fixtures are committed.
  it.skip('normalization strips raw names and provenance before diff', () => {
    // Plan 04: load fixtures/parity/reference.pen (via PencilMcpClient),
    // load fixtures/parity/figma-rest.json, stitch.zip, figma-make.json,
    // pass each through its adapter, normalize (sort by id, strip provenance, post-sanitize),
    // assert deep-equal between all four resulting PlatformSpec + DesignTokens objects.
  })
})
