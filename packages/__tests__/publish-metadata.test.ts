// Phase 1 Plan 08 (NPM-01): guard test — every published package has the required publish metadata
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PublishedPkg {
  label: string
  path: string
  json: {
    name: string
    version: string
    description?: string
    license?: string
    keywords?: string[]
    repository?: { type?: string; url?: string; directory?: string }
    homepage?: string
    bugs?: string | { url?: string; email?: string }
    publishConfig?: { access?: string; provenance?: boolean }
    files?: string[]
    bin?: Record<string, string>
    author?: string | { name?: string }
    private?: boolean
  }
}

function repoRoot(): string {
  // This file lives at packages/__tests__/publish-metadata.test.ts → root is two parents up.
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '..', '..')
}

function loadPackages(): PublishedPkg[] {
  const root = repoRoot()
  const pkgs: PublishedPkg[] = []

  const cliPath = join(root, 'cli', 'package.json')
  pkgs.push({
    label: 'cli',
    path: cliPath,
    json: JSON.parse(readFileSync(cliPath, 'utf8')),
  })

  const packagesDir = join(root, 'packages')
  for (const dir of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, dir)
    let isDir = false
    try {
      isDir = statSync(pkgDir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    const pkgJsonPath = join(pkgDir, 'package.json')
    let json: PublishedPkg['json']
    try {
      json = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    } catch {
      continue
    }
    if (json.private) continue
    pkgs.push({ label: `packages/${dir}`, path: pkgJsonPath, json })
  }
  return pkgs
}

const pkgs = loadPackages()
const REPO_URL = 'git+https://github.com/appifex/appifex-dtc.git'

describe('NPM-01 publish metadata invariants', () => {
  it('loaded at least 19 published packages', () => {
    expect(pkgs.length).toBeGreaterThanOrEqual(19)
  })

  it.each(pkgs)('$label has @appifex-scoped name', ({ json }) => {
    expect(json.name).toMatch(/^@appifex\/[a-z][a-z0-9-]*$/)
  })

  it.each(pkgs)('$label has license=MIT', ({ json }) => {
    expect(json.license).toBe('MIT')
  })

  it.each(pkgs)('$label has publishConfig.access=public', ({ json }) => {
    expect(json.publishConfig?.access).toBe('public')
  })

  it.each(pkgs)('$label has repository pointing at canonical repo with directory', ({ json }) => {
    expect(json.repository?.url).toBe(REPO_URL)
    expect(json.repository?.directory).toBeTruthy()
  })

  it.each(pkgs)('$label has homepage', ({ json }) => {
    expect(json.homepage).toBeTruthy()
  })

  it.each(pkgs)('$label has bugs', ({ json }) => {
    expect(json.bugs).toBeTruthy()
    if (typeof json.bugs === 'object') {
      expect(json.bugs.url ?? json.bugs.email).toBeTruthy()
    }
  })

  it.each(pkgs)('$label has author', ({ json }) => {
    expect(json.author).toBeTruthy()
    if (typeof json.author === 'object') {
      expect(json.author.name).toBeTruthy()
    }
  })

  it.each(pkgs)('$label has non-empty files allowlist', ({ json }) => {
    expect(Array.isArray(json.files)).toBe(true)
    expect(json.files!.length).toBeGreaterThan(0)
  })

  it('packages/core retains bundled skills in files allowlist', () => {
    const core = pkgs.find((p) => p.json.name === '@appifex/core')
    expect(core).toBeDefined()
    expect(core!.json.files).toEqual(expect.arrayContaining(['dist', 'skills']))
  })

  it('@appifex/cli has the dtc bin entry', () => {
    const cli = pkgs.find((p) => p.json.name === '@appifex/cli')
    expect(cli).toBeDefined()
    expect(cli!.json.bin?.dtc).toBe('./dist/entry.js')
  })

  it('@appifex/mcp-server has the dtc-mcp-server bin entry', () => {
    const mcp = pkgs.find((p) => p.json.name === '@appifex/mcp-server')
    expect(mcp).toBeDefined()
    expect(mcp!.json.bin?.['dtc-mcp-server']).toBe('./dist/index.js')
  })
})
