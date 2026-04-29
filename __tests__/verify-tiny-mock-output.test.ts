import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')
const verifier = join(repoRoot, 'scripts', 'verify-tiny-mock-output.mjs')

function makeValidOutput(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dtc-tiny-mock-'))
  mkdirSync(join(dir, '.dtc'), { recursive: true })
  mkdirSync(join(dir, 'App.xcodeproj'), { recursive: true })
  mkdirSync(join(dir, 'Sources', 'App'), { recursive: true })

  writeFileSync(join(dir, 'project.yml'), 'name: TinyMock\n', 'utf8')
  writeFileSync(join(dir, 'App.xcodeproj', 'project.pbxproj'), '// project\n', 'utf8')
  writeFileSync(
    join(dir, 'Sources', 'App', 'ContentView.swift'),
    'import SwiftUI\nstruct ContentView: View { var body: some View { Text("Tiny") } }\n',
    'utf8',
  )
  writeFileSync(
    join(dir, '.dtc', 'run-context.json'),
    JSON.stringify({
      runId: 'fixture-run',
      platform: 'swiftui',
      phases: [{ id: 'build', status: 'completed' }],
    }),
    'utf8',
  )
  writeFileSync(join(dir, 'report.json'), '{"status":"ok"}\n', 'utf8')
  return dir
}

function runVerifier(outDir: string) {
  return spawnSync(process.execPath, [verifier, '--out', outDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

describe('verify-tiny-mock-output', () => {
  it('passes for a generated fixture tree with project, Swift, run context, and report output', () => {
    const outDir = makeValidOutput()
    try {
      const result = runVerifier(outDir)
      expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0)
      expect(result.stdout).toContain('tiny-mock output verified')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('fails with a direct missing-file message when project.yml is absent', () => {
    const outDir = makeValidOutput()
    try {
      rmSync(join(outDir, 'project.yml'), { force: true })
      const result = runVerifier(outDir)
      expect(result.status).toBe(1)
      expect(`${result.stdout}\n${result.stderr}`).toContain('project.yml')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('fails when generated text files contain credential-like content', () => {
    const outDir = makeValidOutput()
    try {
      writeFileSync(
        join(outDir, 'Sources', 'App', 'Leaked.swift'),
        'let secret = "ANTHROPIC_API_KEY=sk-test"\n',
        'utf8',
      )
      const result = runVerifier(outDir)
      expect(result.status).toBe(1)
      expect(`${result.stdout}\n${result.stderr}`).toContain('ANTHROPIC_API_KEY=')
      expect(`${result.stdout}\n${result.stderr}`).toContain('Leaked.swift')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
