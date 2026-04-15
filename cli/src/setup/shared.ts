// Phase 03 Plan 03 (SETUP-01, D-09): shared helpers for setup sections.
import chalk from 'chalk'
import { randomBytes } from 'node:crypto'
import { ConfigError } from '@appifex/core'

/**
 * Derives a URL-safe slug from an app name.
 * Strips non-ASCII, lowercases, replaces spaces/special chars with hyphens,
 * collapses repeated hyphens, strips leading/trailing hyphens, and truncates.
 *
 * Based on RESEARCH §Code Examples "Slug Derivation (D-02)".
 */
export function derivedSlug(appName: string, maxLen = 20): string {
  return appName
    .normalize('NFD')
    // Remove combining diacritics
    .replace(/[\u0300-\u036f]/g, '')
    // Lowercase
    .toLowerCase()
    // Replace anything that isn't alphanumeric or hyphen with a hyphen
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    // Strip leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Truncate
    .slice(0, maxLen)
    // Strip any trailing hyphen introduced by truncation
    .replace(/-+$/, '')
}

/**
 * Derives a valid Firebase project ID from a slug.
 * Firebase requires: lowercase, 6–30 chars, start with a letter.
 * A 4-char random hex suffix is appended to ensure global uniqueness.
 */
export function firebaseProjectIdFromSlug(slug: string): string {
  const suffix = randomBytes(2).toString('hex') // e.g. "a3f2"
  let base = slug.slice(0, 25) // leave room for "-" + 4-char suffix
  // Prepend 'app-' when slug starts with a digit (Firebase requires letter-start)
  if (/^[0-9]/.test(base)) {
    base = `app-${base.slice(0, 21)}`
  }
  const id = `${base}-${suffix}`
  // Final truncation to 30 chars
  return id.slice(0, 30)
}

/**
 * Asserts a @clack/prompts return value is not the cancel sentinel (a symbol).
 * Throws ConfigError if cancelled.
 */
export function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (typeof value === 'symbol') {
    throw new ConfigError('Setup cancelled.')
  }
}

// ── Chalk helpers matching existing conventions ──
export const ok = chalk.green
export const warn = chalk.yellow
export const fail = chalk.red
export const hint = chalk.dim
