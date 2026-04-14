// scripts/rename-scope.mjs — one-shot workspace rename
// Phase 1 Plan 01 (D-11, NPM-01): rename @dtc/* → @appifex/* and appifex-dtc → @appifex/cli
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

let changed = 0
for (const f of targets) {
  const before = readFileSync(f, 'utf8')
  const after = before
    .replace(/@dtc\//g, '@appifex/')
    .replace(/"appifex-dtc"/g, '"@appifex/cli"')
    .replace(/'appifex-dtc'/g, "'@appifex/cli'")
  if (after !== before) {
    writeFileSync(f, after)
    changed++
    console.log('rewrote', relative(ROOT, f))
  }
}
console.log(`done — ${changed} file(s) rewritten`)
