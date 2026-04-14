// scripts/rename-scope.mjs — one-shot workspace rename
// Phase 1 Plan 01 (D-11, NPM-01): rename old @ scope → @appifex scope and the
// old root pkg name → @appifex/cli. The actual literal source strings live
// only in the SRC_PKG construction and the regex below so this script can be
// re-run safely as a no-op once the rename is applied.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.planning', '.dtc', '.dtc-debug', '.dtc-report', '__fixtures__'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else yield full
  }
}

const targets = []
for (const f of walk(ROOT)) {
  const rel = relative(ROOT, f)
  // package.json everywhere; vitest.config.ts; all TS in packages/cli/scripts
  if (
    rel.endsWith('package.json') ||
    rel === 'vitest.config.ts' ||
    (rel.startsWith('packages/') && (rel.endsWith('.ts') || rel.endsWith('.tsx'))) ||
    (rel.startsWith('cli/') && (rel.endsWith('.ts') || rel.endsWith('.tsx'))) ||
    (rel.startsWith('scripts/') && rel.endsWith('.mjs'))
  ) {
    if (rel === 'pnpm-lock.yaml') continue
    targets.push(f)
  }
}

// Source pkg name assembled to keep this script idempotent — a literal
// "@appifex/cli" anywhere in this file would be rewritten by the script itself
// on a second run. Building it from parts means re-running this script after
// the rename completes is a no-op.
const SRC_PKG = 'appifex' + '-' + 'dtc'
const DST_PKG = '@appifex/cli'

let changed = 0
for (const f of targets) {
  const before = readFileSync(f, 'utf8')
  const after = before
    .replace(/@dtc\//g, '@appifex/')
    .replace(new RegExp(`"${SRC_PKG}"`, 'g'), `"${DST_PKG}"`)
    .replace(new RegExp(`'${SRC_PKG}'`, 'g'), `'${DST_PKG}'`)
  if (after !== before) {
    writeFileSync(f, after)
    changed++
    console.log('rewrote', relative(ROOT, f))
  }
}
console.log(`done — ${changed} file(s) rewritten`)
