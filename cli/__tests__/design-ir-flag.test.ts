// Phase 1 Plan 07 (GATE-02): coverage for the --design-ir fallback flag.
// The fallback path is the spike outcome (b)/(c) escape hatch documented in
// fixtures/tiny-mock/README.md — when Pencil MCP cannot run offline, CI hands
// the pipeline a pre-extracted PlatformSpec JSON via --design-ir instead.
import { describe, it, expect } from 'vitest'
import { parseArgs } from '../src/cli.js'

describe('parseArgs — --design-ir flag', () => {
  it('parses --design-ir <path> into designIrPath', () => {
    const result = parseArgs(['run', '--design-ir', 'fixtures/tiny-mock/design-ir.json'])

    expect(result.command).toBe('run')
    expect(result.designIrPath).toBe('fixtures/tiny-mock/design-ir.json')
    expect(result.flags['design-ir']).toBe('fixtures/tiny-mock/design-ir.json')
  })

  it('parses --design <pen> with designIrPath undefined', () => {
    const result = parseArgs(['run', '--design', 'foo.pen'])

    expect(result.command).toBe('run')
    expect(result.flags.design).toBe('foo.pen')
    expect(result.designIrPath).toBeUndefined()
  })

  it('leaves designIrPath undefined when neither flag is passed', () => {
    const result = parseArgs(['run', '--prompt', 'Pet app'])

    expect(result.designIrPath).toBeUndefined()
  })

  it('throws "Pass exactly one of --design or --design-ir" when both are passed', () => {
    expect(() => parseArgs(['run', '--design', 'foo.pen', '--design-ir', 'foo.json'])).toThrowError(
      'Pass exactly one of --design or --design-ir',
    )
  })

  it('throws regardless of flag order (design-ir first)', () => {
    expect(() => parseArgs(['run', '--design-ir', 'foo.json', '--design', 'foo.pen'])).toThrowError(
      'Pass exactly one of --design or --design-ir',
    )
  })
})
