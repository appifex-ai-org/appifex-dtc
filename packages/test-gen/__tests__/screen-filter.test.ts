import { describe, it, expect } from 'vitest'
import type { PlatformSpec } from '@appifex/core'
import { generateUITests } from '../src/ui-tests.js'
import { generateSpecUnitTests } from '../src/unit-tests.js'

function makeSpec(platform: 'swiftui' | 'kotlin-compose', screenNames: string[]): PlatformSpec {
  return {
    platform,
    screens: screenNames.map((name, i) => ({
      id: `scr-${i}`,
      name,
      componentName: `${name.replace(/\s+/g, '')}View`,
      description: `${name} screen`,
      components: [
        {
          id: `${name}-c1`,
          platformType: 'Button',
          name: `${name}Button`,
          props: { accessibilityIdentifier: `${name}Button` },
          style: {},
          testId: `${name}Button`,
        },
      ],
      testIds: { [`${name}-c1`]: `${name}Button` },
    })),
    designTokens: {
      colors: { primary: '#000000' },
      typography: {},
      spacing: {},
      borderRadius: {},
    },
    imports: ['SwiftUI'],
  }
}

describe('generateUITests screenFilter', () => {
  it('returns only flows for screens in the filter', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const flows = generateUITests(spec, {
      screenFilter: new Set(['Detail']),
    })
    expect(flows).toHaveLength(1)
    expect(flows[0].name).toBe('Detail')
  })

  it('returns all flows when filter is undefined (backward compat)', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const flowsNoOpts = generateUITests(spec)
    const flowsUndefFilter = generateUITests(spec, {})
    expect(flowsNoOpts).toHaveLength(3)
    expect(flowsUndefFilter).toHaveLength(3)
  })

  it('returns empty array when filter is empty Set', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const flows = generateUITests(spec, { screenFilter: new Set() })
    expect(flows).toHaveLength(0)
  })
})

describe('generateSpecUnitTests screenFilter', () => {
  it('emits distinct Regen filename for swiftui (Pitfall 3 mitigation)', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const files = generateSpecUnitTests(spec, new Set(['Detail']))
    expect(files).toHaveLength(1)
    expect(files[0].fileName).not.toBe('ViewTests.swift')
    expect(files[0].fileName).toMatch(/Regen/)
  })

  it('emits distinct Regen filename for kotlin-compose (Pitfall 3 mitigation)', () => {
    const spec = makeSpec('kotlin-compose', ['Home', 'Detail', 'Profile'])
    const files = generateSpecUnitTests(spec, new Set(['Detail']))
    expect(files).toHaveLength(1)
    expect(files[0].fileName).not.toBe('ScreenTest.kt')
    expect(files[0].fileName).toMatch(/Regen/)
  })

  it('returns all screens with original filename when filter is undefined (byte-identical backward compat)', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const filesNoFilter = generateSpecUnitTests(spec)
    expect(filesNoFilter).toHaveLength(1)
    expect(filesNoFilter[0].fileName).toBe('ViewTests.swift')
    // byte-identical check: explicit undefined must match no-arg
    const filesUndefExplicit = generateSpecUnitTests(spec, undefined)
    expect(filesUndefExplicit[0].content).toBe(filesNoFilter[0].content)
    expect(filesUndefExplicit[0].fileName).toBe(filesNoFilter[0].fileName)
  })

  it('returns empty array when filter is empty Set (D-10 skip semantics)', () => {
    const spec = makeSpec('swiftui', ['Home', 'Detail', 'Profile'])
    const files = generateSpecUnitTests(spec, new Set())
    expect(files).toHaveLength(0)
  })
})
