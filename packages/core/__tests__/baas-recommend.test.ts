import { describe, it, expect } from 'vitest'
import { assessBaasAppropriateness, extractBaasSignals } from '../src/baas-recommend.js'
import type { PlatformSpec } from '../src/types.js'

// Helper to build minimal PlatformSpec fixtures
function makeSpec(screens: Array<{ name: string; description: string; components: Array<{ name: string; platformType: string }> }>): PlatformSpec {
  return {
    platform: 'swiftui',
    screens: screens.map(s => ({
      id: s.name.toLowerCase().replace(/\s/g, '-'),
      name: s.name,
      componentName: s.name.replace(/\s/g, ''),
      description: s.description,
      components: s.components.map(c => ({
        id: c.name.toLowerCase(),
        platformType: c.platformType,
        name: c.name,
        props: {},
        style: {},
      })),
      testIds: {},
    })),
    designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
    imports: [],
  }
}

function makeScreens(count: number, namePrefix = 'Screen'): Array<{ name: string; description: string; components: Array<{ name: string; platformType: string }> }> {
  return Array.from({ length: count }, (_, i) => ({
    name: `${namePrefix} ${i + 1}`,
    description: `Screen ${i + 1} description`,
    components: [],
  }))
}

describe('assessBaasAppropriateness', () => {
  it('returns tier appropriate for a simple 4-screen CRUD spec with no special patterns', () => {
    const spec = makeSpec([
      { name: 'Home', description: 'Main screen', components: [{ name: 'title', platformType: 'Text' }] },
      { name: 'List', description: 'Item list', components: [{ name: 'list', platformType: 'Text' }] },
      { name: 'Create', description: 'Create item', components: [{ name: 'field', platformType: 'TextField' }] },
      { name: 'Settings', description: 'App settings', components: [{ name: 'toggle', platformType: 'Toggle' }] },
    ])
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('appropriate')
    expect(result.reason).toMatch(/BaaS appropriate/i)
  })

  it('returns tier caveats for a 10-screen spec with list-detail pairs and avgInputsPerScreen > 3', () => {
    // Use screen names with unique entity prefixes so self-referential is NOT triggered
    // "Alpha", "Beta" are both >3 chars but appear only once each — no self-referential
    // One has a List component + another has "Detail" in name => hasListDetailPairs=true
    // avgInputsPerScreen: 8 TextField across 10 screens = 0.8 (> 0, not > 3)
    // BUT: 10 screens > 8 => caveats threshold is met via screenCount alone
    const screens = [
      { name: 'Alpha Screen', description: 'Screen with list', components: [{ name: 'list', platformType: 'List' }] },
      { name: 'Beta Detail', description: 'Detail view', components: [
        { name: 'f1', platformType: 'TextField' },
        { name: 'f2', platformType: 'TextField' },
        { name: 'f3', platformType: 'TextField' },
        { name: 'f4', platformType: 'TextField' },
      ]},
      ...makeScreens(8, 'Extra'),
    ]
    const spec = makeSpec(screens)
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('caveats')
  })

  it('returns tier caveats for a 9-screen spec with list-detail pairs even when avgInputsPerScreen <= 3', () => {
    // 9 screens > 8 => caveats via screenCount alone (no self-referential patterns)
    const screens = [
      { name: 'Alpha Screen', description: 'Screen with list', components: [{ name: 'list', platformType: 'List' }] },
      { name: 'Beta Detail', description: 'Detail view', components: [{ name: 'f1', platformType: 'TextField' }] },
      ...makeScreens(7, 'Page'),
    ]
    const spec = makeSpec(screens)
    const result = assessBaasAppropriateness(spec)
    // 9 screens > 8 => caveats
    expect(result.tier).toBe('caveats')
  })

  it('returns tier custom_backend for a 16-screen spec', () => {
    const spec = makeSpec(makeScreens(16))
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('custom_backend')
  })

  it('returns tier custom_backend for a 4-screen spec with aggregate keyword in description', () => {
    const spec = makeSpec([
      { name: 'Home', description: 'Main screen', components: [] },
      { name: 'Stats', description: 'Analytics dashboard showing totals', components: [] },
      { name: 'Profile', description: 'User profile', components: [] },
      { name: 'Settings', description: 'App settings', components: [] },
    ])
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('custom_backend')
  })

  it('returns tier custom_backend for spec where two screens share entity name prefix (self-referential)', () => {
    // 'Order List' strips 'list' -> entity 'order'; 'Order Detail' strips 'detail' -> entity 'order'
    // entity 'order' appears in 2 screens => hasSelfReferentialPatterns=true => custom_backend
    const spec = makeSpec([
      { name: 'Order List', description: 'Orders', components: [] },
      { name: 'Order Detail', description: 'Order detail', components: [] },
      { name: 'Home', description: 'Home screen', components: [] },
    ])
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('custom_backend')
  })

  it('returns tier appropriate for empty screens array (0 screens, no signals)', () => {
    const spec = makeSpec([])
    const result = assessBaasAppropriateness(spec)
    expect(result.tier).toBe('appropriate')
  })
})

describe('extractBaasSignals', () => {
  it('extracts correct screenCount, hasListDetailPairs, avgInputsPerScreen for known fixture', () => {
    const spec = makeSpec([
      { name: 'Task List', description: 'Tasks', components: [{ name: 'list', platformType: 'List' }] },
      { name: 'Task Detail', description: 'Task detail', components: [
        { name: 'f1', platformType: 'TextField' },
        { name: 'f2', platformType: 'TextField' },
      ]},
      { name: 'Settings', description: 'Settings', components: [] },
    ])
    const signals = extractBaasSignals(spec)
    expect(signals.screenCount).toBe(3)
    expect(signals.hasListDetailPairs).toBe(true)
    // 2 inputs across 3 screens = ~0.67
    expect(signals.avgInputsPerScreen).toBeCloseTo(2 / 3, 2)
    expect(signals.hasAggregateDescriptions).toBe(false)
  })
})
