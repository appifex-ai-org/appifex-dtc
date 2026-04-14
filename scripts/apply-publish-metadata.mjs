#!/usr/bin/env node
// Phase 1 Plan 05 (NPM-01): Apply publish metadata to every workspace package.
// Idempotent — safe to run repeatedly. Writes with trailing newline + 2-space indent
// to match Prettier defaults.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const REPO_URL = 'https://github.com/appifex/appifex-dtc'
const AUTHOR = 'Appifex'
const LICENSE = 'MIT'

const packagesDir = resolve(root, 'packages')
const pkgPaths = [
  resolve(root, 'cli/package.json'),
  ...readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => resolve(packagesDir, d.name, 'package.json')),
]

let changed = 0
for (const pkgPath of pkgPaths) {
  const raw = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(raw)
  const dir = relative(root, dirname(pkgPath))

  pkg.license = LICENSE
  pkg.author = AUTHOR
  pkg.homepage = `${REPO_URL}#readme`
  pkg.bugs = { url: `${REPO_URL}/issues` }
  pkg.repository = {
    type: 'git',
    url: `git+${REPO_URL}.git`,
    directory: dir,
  }
  pkg.publishConfig = {
    ...(pkg.publishConfig ?? {}),
    access: 'public',
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    pkg.files = ['dist']
  }

  const next = JSON.stringify(pkg, null, 2) + '\n'
  if (next !== raw) {
    writeFileSync(pkgPath, next)
    changed++
    console.log(`updated: ${dir}`)
  }
}

console.log(`\n${changed}/${pkgPaths.length} package.json files updated.`)
