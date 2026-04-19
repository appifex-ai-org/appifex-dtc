/**
 * Phase 04 (DX-08): locality-aware ranker for the Copilot fix-loop.
 *
 * Pure function — deterministic, no I/O. When test failures are available,
 * source files whose paths / basenames overlap failure signals sort first;
 * ties preserve input order. When no failure signals exist the ranker
 * returns input order unchanged, so swapping `sourceFiles.slice(0, 20)` for
 * `rankFilesByFailureLocality(...).slice(0, 20)` is a strict Pareto
 * improvement over the previous blind first-N-glob behaviour.
 *
 * The input shape is deliberately structural (FailureSignals) rather than
 * `@appifex/validate`'s `ValidationResult`. This keeps `@appifex/analysis`
 * from pulling `@appifex/validate` into its dependency graph; any caller
 * can pass a ValidationResult (it satisfies the duck-typed shape) or hand-
 * rolled fixture.
 */
import { basename } from 'node:path'

export interface FailureSignals {
  ui?: { results?: Array<{ flowName?: string; error?: string; passed?: boolean }> }
  unit?: { failures?: Array<{ testName?: string; file?: string }> }
}

const EXACT_MATCH_SCORE = 10
const DIR_OVERLAP_SCORE = 5
const BASENAME_IN_TEXT_SCORE = 3

// Directory segments that carry no locality signal — they appear in nearly
// every source path so "dir overlap" on them is meaningless noise.
const NON_SPECIFIC_SEGMENTS: ReadonlySet<string> = new Set(['src', 'Sources'])

// Escape regex special characters so a basename like `foo.bar` matches
// literally and doesn't blow up at runtime with an invalid pattern.
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripExt(p: string): string {
  return basename(p).replace(/\.(ts|tsx|swift|kt|js|jsx)$/, '')
}

function dirSegments(p: string): Set<string> {
  // Drop the filename; keep non-trivial directory segments.
  return new Set(
    p
      .split('/')
      .slice(0, -1)
      .filter((s) => s.length > 1 && !NON_SPECIFIC_SEGMENTS.has(s)),
  )
}

function wordBoundaryHit(haystack: string, needle: string): boolean {
  if (!needle) return false
  return new RegExp(`\\b${escapeRegex(needle)}\\b`).test(haystack)
}

function scoreFile(file: string, failures: FailureSignals): number {
  let score = 0
  const fileBasename = stripExt(file)
  const fileDirs = dirSegments(file)

  // Unit failures — test-runner side.
  for (const f of failures.unit?.failures ?? []) {
    if (f.file === file) {
      score += EXACT_MATCH_SCORE
    } else if (f.file) {
      const otherDirs = dirSegments(f.file)
      for (const d of otherDirs) {
        if (fileDirs.has(d)) {
          score += DIR_OVERLAP_SCORE
          break
        }
      }
    }
    if (f.testName && wordBoundaryHit(f.testName, fileBasename)) {
      score += BASENAME_IN_TEXT_SCORE
    }
  }

  // UI flow failures — Maestro side. Passed flows do NOT contribute.
  for (const r of failures.ui?.results ?? []) {
    if (r.passed === true) continue
    if (r.flowName && wordBoundaryHit(r.flowName, fileBasename)) {
      score += BASENAME_IN_TEXT_SCORE
    }
    if (r.error && wordBoundaryHit(r.error, fileBasename)) {
      score += BASENAME_IN_TEXT_SCORE
    }
  }

  return score
}

/**
 * Rank source files by locality to failure signals.
 *
 * Scoring (additive per failure):
 *   +10 — unit-failure `file` exactly equals source path
 *   + 5 — unit-failure `file` shares a non-trivial directory segment
 *   + 3 — unit-failure `testName`, or non-passed ui-result `flowName`/`error`,
 *         contains the source file's basename (sans extension) as a
 *         word-boundary match
 *
 * Tie-break: input order (stable sort via decorate-sort-undecorate).
 *
 * Fallback: if `failures.ui.results` has no non-passed entries and
 * `failures.unit.failures` is empty / missing, returns a copy of
 * `sourceFiles` in input order. This guarantees the swap is a Pareto
 * improvement over the previous "first 20 glob hits" heuristic.
 */
export function rankFilesByFailureLocality(
  sourceFiles: string[],
  failures: FailureSignals,
): string[] {
  const uiResults = failures.ui?.results ?? []
  const unitFailures = failures.unit?.failures ?? []
  const hasSignal = uiResults.some((r) => r.passed !== true) || unitFailures.length > 0

  if (!hasSignal) return [...sourceFiles]

  return sourceFiles
    .map((f, idx) => ({ f, idx, score: scoreFile(f, failures) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.f)
}
