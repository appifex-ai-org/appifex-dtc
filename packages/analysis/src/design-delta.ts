/**
 * Design token diff for add-feature pipeline runs.
 *
 * Phase 12 (QUALITY-02a): diffs two DesignTokens snapshots and classifies each
 * token as added, removed, or changed. Produces a DesignDeltaReport that the
 * pipeline (Plan 03) persists to RunContext and uses as a drift gate.
 *
 * Equality semantics (D-06):
 *   - colors:       case-insensitive hex comparison (trim + toLowerCase)
 *   - spacing:      strict numeric equality (no tolerance)
 *   - borderRadius: strict numeric equality (no tolerance)
 *   - typography:   whole-token deep equality — a single differing field marks
 *                   the token as changed; per-field sub-deltas are NOT emitted
 *
 * Token names are case-sensitive (D-05): 'primary' and 'Primary' are distinct keys.
 *
 * Pure function — no I/O, no async, no mutation of inputs, deterministic ordering
 * (sorted by name within each category for stable test output).
 */

import type {
  DesignTokens,
  DesignTokenCategory,
  DesignDeltaEntry,
  DesignDeltaChangedEntry,
  DesignDeltaReport,
  TypographyToken,
} from '@appifex/core'

// ── Private helpers ──────────────────────────────────────────────────────────

function normalizeColor(value: string): string {
  return value.trim().toLowerCase()
}

function typographyEquals(a: TypographyToken, b: TypographyToken): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.lineHeight === b.lineHeight &&
    a.letterSpacing === b.letterSpacing
  )
}

type EqualsFn<V> = (a: V, b: V) => boolean

interface CategoryDelta<V> {
  added: Array<{ name: string; value: V }>
  removed: Array<{ name: string; value: V }>
  changed: Array<{ name: string; oldValue: V; newValue: V }>
}

function diffCategory<V>(
  existingMap: Record<string, V>,
  nextMap: Record<string, V>,
  equals: EqualsFn<V>,
): CategoryDelta<V> {
  const added: Array<{ name: string; value: V }> = []
  const removed: Array<{ name: string; value: V }> = []
  const changed: Array<{ name: string; oldValue: V; newValue: V }> = []

  const existingKeys = new Set(Object.keys(existingMap))
  const nextKeys = new Set(Object.keys(nextMap))

  // Removed: in existing but not in next
  const removedNames = [...existingKeys].filter((k) => !nextKeys.has(k)).sort()
  for (const name of removedNames) {
    removed.push({ name, value: existingMap[name] })
  }

  // Added: in next but not in existing
  const addedNames = [...nextKeys].filter((k) => !existingKeys.has(k)).sort()
  for (const name of addedNames) {
    added.push({ name, value: nextMap[name] })
  }

  // Changed: in both but values differ
  const sharedNames = [...existingKeys].filter((k) => nextKeys.has(k)).sort()
  for (const name of sharedNames) {
    if (!equals(existingMap[name], nextMap[name])) {
      changed.push({ name, oldValue: existingMap[name], newValue: nextMap[name] })
    }
  }

  return { added, removed, changed }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function diffDesignTokens(existing: DesignTokens, next: DesignTokens): DesignDeltaReport {
  const addedEntries: DesignDeltaEntry[] = []
  const removedEntries: DesignDeltaEntry[] = []
  const changedEntries: DesignDeltaChangedEntry[] = []

  // colors — case-insensitive hex equality
  const colorDelta = diffCategory(existing.colors, next.colors, (a, b) =>
    normalizeColor(a) === normalizeColor(b),
  )
  const category: DesignTokenCategory = 'colors'
  for (const { name, value } of colorDelta.added) {
    addedEntries.push({ category, name, value })
  }
  for (const { name, value } of colorDelta.removed) {
    removedEntries.push({ category, name, value })
  }
  for (const { name, oldValue, newValue } of colorDelta.changed) {
    changedEntries.push({ category, name, oldValue, newValue })
  }

  // typography — whole-token deep equality
  const typographyDelta = diffCategory(existing.typography, next.typography, typographyEquals)
  const typographyCategory: DesignTokenCategory = 'typography'
  for (const { name, value } of typographyDelta.added) {
    addedEntries.push({ category: typographyCategory, name, value })
  }
  for (const { name, value } of typographyDelta.removed) {
    removedEntries.push({ category: typographyCategory, name, value })
  }
  for (const { name, oldValue, newValue } of typographyDelta.changed) {
    changedEntries.push({ category: typographyCategory, name, oldValue, newValue })
  }

  // spacing — strict numeric equality
  const spacingDelta = diffCategory(existing.spacing, next.spacing, (a, b) => a === b)
  const spacingCategory: DesignTokenCategory = 'spacing'
  for (const { name, value } of spacingDelta.added) {
    addedEntries.push({ category: spacingCategory, name, value })
  }
  for (const { name, value } of spacingDelta.removed) {
    removedEntries.push({ category: spacingCategory, name, value })
  }
  for (const { name, oldValue, newValue } of spacingDelta.changed) {
    changedEntries.push({ category: spacingCategory, name, oldValue, newValue })
  }

  // borderRadius — strict numeric equality
  const borderRadiusDelta = diffCategory(existing.borderRadius, next.borderRadius, (a, b) => a === b)
  const borderRadiusCategory: DesignTokenCategory = 'borderRadius'
  for (const { name, value } of borderRadiusDelta.added) {
    addedEntries.push({ category: borderRadiusCategory, name, value })
  }
  for (const { name, value } of borderRadiusDelta.removed) {
    removedEntries.push({ category: borderRadiusCategory, name, value })
  }
  for (const { name, oldValue, newValue } of borderRadiusDelta.changed) {
    changedEntries.push({ category: borderRadiusCategory, name, oldValue, newValue })
  }

  return {
    added: addedEntries,
    removed: removedEntries,
    changed: changedEntries,
  }
}
