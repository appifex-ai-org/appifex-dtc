// Phase 02 Plan 05: regression test for root `prepare` script pnpm-install failure.
//
// Background: `pnpm install` fails with ELIFECYCLE when the contributor's clone has
// `git config --local core.hooksPath` set locally, because the root `prepare` script
// runs `lefthook install` unguarded and lefthook refuses to overwrite a configured
// hooks path without `--force`. A secondary failure mode exists for installs run
// outside a git working tree (tarball installs, npm packs, some CI layouts) because
// lefthook errors out with "not a git repository".
//
// Red-phase probe (recorded per plan `<action>` step):
//   lefthook --version          -> lefthook version 2.1.5
//   (cd $(mktemp -d) && lefthook install; echo exit=$?)
//                               -> "fatal: not a git repository" / exit=1
// Therefore Test 2 is a true RED→GREEN cycle for lefthook 2.1.5.
//
// Skipped on Windows per CLAUDE.md (macOS-first). Skipped if `node_modules/.bin/lefthook`
// is missing (uninitialized local checkout) — CI always runs `pnpm install` first.

import { describe, it, expect, beforeAll } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')
const lefthookBin = join(repoRoot, 'node_modules', '.bin', 'lefthook')
const hasLefthook = existsSync(lefthookBin)

interface RootPkg {
  scripts?: Record<string, string>
}

describe.skipIf(process.platform === 'win32' || !hasLefthook)(
  'root prepare script guards against core.hooksPath / missing .git',
  () => {
    let prepareScript: string
    let pkgJsonRaw: string

    beforeAll(() => {
      pkgJsonRaw = readFileSync(join(repoRoot, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgJsonRaw) as RootPkg
      const p = pkg.scripts?.prepare
      if (!p) throw new Error('root package.json has no scripts.prepare')
      prepareScript = p
    })

    it('Test 1: exits 0 inside a git tree where core.hooksPath is set locally', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'dtc-prepare-hp-'))
      try {
        execSync('git init -q', { cwd: tmp })
        const hooksDir = join(tmp, '.git', 'hooks')
        execSync(`git config --local core.hooksPath "${hooksDir}"`, { cwd: tmp })
        const result = spawnSync('sh', ['-c', prepareScript], {
          cwd: tmp,
          env: {
            ...process.env,
            PATH: `${join(repoRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
          },
          encoding: 'utf8',
        })
        expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }, 15_000)

    it('Test 2: exits 0 in a directory with no .git folder (tarball / pack install)', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'dtc-prepare-nogit-'))
      try {
        const result = spawnSync('sh', ['-c', prepareScript], {
          cwd: tmp,
          env: {
            ...process.env,
            PATH: `${join(repoRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
          },
          encoding: 'utf8',
        })
        expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }, 15_000)

    it('Test 3: prepare script contains `lefthook install --force`', () => {
      const pkg = JSON.parse(pkgJsonRaw) as RootPkg
      expect(pkg.scripts?.prepare ?? '').toContain('lefthook install --force')
    })
  },
)
