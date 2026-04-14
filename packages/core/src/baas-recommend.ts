import type { PlatformSpec, BaasRecommendation } from './types.js'

// Platform-specific component type sets for structural signal extraction
const LIST_TYPES = new Set(['List', 'LazyVGrid', 'LazyVStack', 'ForEach', 'ScrollView', 'FlatList', 'LazyColumn', 'RecyclerView'])
const INPUT_TYPES = new Set(['TextField', 'SecureField', 'TextEditor', 'Toggle', 'Picker', 'Slider', 'Stepper', 'DatePicker', 'TextInput', 'Switch', 'OutlinedTextField'])
const AGGREGATE_KEYWORDS = ['total', 'sum', 'aggregate', 'analytics', 'report', 'dashboard', 'stat']

// Suffixes stripped when extracting entity names for self-referential pattern detection
const SCREEN_SUFFIXES = ['list', 'detail', 'screen', 'view', 'page']

export interface BaasSignals {
  screenCount: number
  hasListDetailPairs: boolean
  hasSelfReferentialPatterns: boolean
  hasAggregateDescriptions: boolean
  avgInputsPerScreen: number
}

/** Count all components (recursively) matching a predicate */
function countComponents(
  components: PlatformSpec['screens'][number]['components'],
  predicate: (platformType: string) => boolean,
): number {
  let count = 0
  for (const comp of components) {
    if (predicate(comp.platformType)) count++
    if (comp.children) count += countComponents(comp.children, predicate)
  }
  return count
}

/** Check if any component (recursively) matches a predicate */
function anyComponent(
  components: PlatformSpec['screens'][number]['components'],
  predicate: (platformType: string) => boolean,
): boolean {
  for (const comp of components) {
    if (predicate(comp.platformType)) return true
    if (comp.children && anyComponent(comp.children, predicate)) return true
  }
  return false
}

/**
 * Extract the entity name from a screen name by stripping common suffixes.
 * Returns null if the resulting entity name is too short to be meaningful.
 */
function extractEntityName(screenName: string): string | null {
  const lower = screenName.toLowerCase()
  const words = lower.split(/\s+/)
  // Remove trailing words that are common screen-role suffixes
  const filtered = words.filter(w => !SCREEN_SUFFIXES.includes(w))
  const entity = filtered.join(' ').trim()
  return entity.length > 3 ? entity : null
}

/**
 * Extract structural signals from a PlatformSpec for BaaS appropriateness assessment.
 * Operates only on structural spec data — no text/keyword analysis of prompt content.
 */
export function extractBaasSignals(spec: PlatformSpec): BaasSignals {
  const screens = spec.screens
  const screenCount = screens.length

  // hasAggregateDescriptions: any screen description contains an aggregate keyword
  const hasAggregateDescriptions = screens.some(s =>
    AGGREGATE_KEYWORDS.some(kw => s.description.toLowerCase().includes(kw)),
  )

  // hasListDetailPairs: any screen has a LIST_TYPE component AND another screen name contains 'detail' or 'item'
  const hasScreenWithList = screens.some(s => anyComponent(s.components, t => LIST_TYPES.has(t)))
  const hasScreenWithDetailOrItem = screens.some(s => {
    const lower = s.name.toLowerCase()
    return lower.includes('detail') || lower.includes('item')
  })
  const hasListDetailPairs = hasScreenWithList && hasScreenWithDetailOrItem

  // hasSelfReferentialPatterns: entity name (stripped of role suffixes) appears in 2+ different screen names
  const entityCounts = new Map<string, number>()
  for (const s of screens) {
    const entity = extractEntityName(s.name)
    if (entity !== null) {
      entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1)
    }
  }
  const hasSelfReferentialPatterns = Array.from(entityCounts.values()).some(count => count >= 2)

  // avgInputsPerScreen: total INPUT_TYPE components / screenCount
  let totalInputs = 0
  for (const s of screens) {
    totalInputs += countComponents(s.components, t => INPUT_TYPES.has(t))
  }
  const avgInputsPerScreen = screenCount > 0 ? totalInputs / screenCount : 0

  return {
    screenCount,
    hasListDetailPairs,
    hasSelfReferentialPatterns,
    hasAggregateDescriptions,
    avgInputsPerScreen,
  }
}

/**
 * Assess BaaS appropriateness for a given PlatformSpec.
 *
 * Tier thresholds (per D-01/D-03):
 * - custom_backend: screenCount > 15 OR hasAggregateDescriptions OR hasSelfReferentialPatterns
 * - caveats:        screenCount > 8 OR (hasListDetailPairs AND avgInputsPerScreen > 3)
 * - appropriate:    otherwise
 */
export function assessBaasAppropriateness(spec: PlatformSpec): BaasRecommendation {
  const signals = extractBaasSignals(spec)
  const { screenCount, hasListDetailPairs, hasSelfReferentialPatterns, hasAggregateDescriptions, avgInputsPerScreen } = signals

  if (screenCount > 15 || hasAggregateDescriptions || hasSelfReferentialPatterns) {
    const reasons: string[] = []
    if (screenCount > 15) reasons.push(`${screenCount} screens exceeds BaaS threshold`)
    if (hasAggregateDescriptions) reasons.push('aggregate/analytics patterns detected')
    if (hasSelfReferentialPatterns) reasons.push('self-referential entity patterns detected')
    return {
      tier: 'custom_backend',
      reason: `Custom backend recommended: ${reasons.join('; ')}`,
    }
  }

  if (screenCount > 8 || (hasListDetailPairs && avgInputsPerScreen > 3)) {
    const reasons: string[] = []
    if (screenCount > 8) reasons.push(`${screenCount} screens may strain BaaS query model`)
    if (hasListDetailPairs && avgInputsPerScreen > 3) reasons.push(`list-detail pairs with ${avgInputsPerScreen.toFixed(1)} avg inputs/screen`)
    return {
      tier: 'caveats',
      reason: `BaaS appropriate with caveats: ${reasons.join('; ')}`,
    }
  }

  return {
    tier: 'appropriate',
    reason: `BaaS appropriate: ${screenCount} screens, no complex patterns detected`,
  }
}
