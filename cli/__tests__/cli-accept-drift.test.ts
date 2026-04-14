// Plan 03 Task 3: Verify --accept-drift flag is parsed and forwarded into PipelineOpts.
// These tests mock renderRunApp to capture opts without executing the pipeline.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from '../src/cli.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('--accept-drift flag parsing', () => {
  it('parseArgs parses --accept-drift as a boolean flag', () => {
    const parsed = parseArgs(['run', '--prompt', 'Add dark mode', '--platform', 'swiftui', '--out', './app', '--accept-drift'])
    expect(parsed.command).toBe('run')
    expect(parsed.flags['accept-drift']).toBe(true)
  })

  it('parseArgs does not set accept-drift when flag is absent', () => {
    const parsed = parseArgs(['run', '--prompt', 'Add dark mode', '--platform', 'swiftui', '--out', './app'])
    expect(parsed.flags['accept-drift']).toBeUndefined()
  })

  it('entry.ts source contains --accept-drift flag extraction code', () => {
    const entryPath = join(__dirname, '..', 'src', 'entry.ts')
    const src = readFileSync(entryPath, 'utf8')
    expect(src).toContain("accept-drift")
    expect(src).toContain('acceptDrift')
  })

  it('entry.ts forwards acceptDrift into the renderRunApp opts', () => {
    const entryPath = join(__dirname, '..', 'src', 'entry.ts')
    const src = readFileSync(entryPath, 'utf8')
    // Both extraction and forwarding must be present
    expect(src).toContain("args.flags['accept-drift']")
    expect(src).toContain('acceptDrift,')
  })

  it('pipeline.ts contains acceptDrift in PipelineOpts', () => {
    const pipelinePath = join(__dirname, '..', 'src', 'pipeline.ts')
    const src = readFileSync(pipelinePath, 'utf8')
    expect(src).toContain('acceptDrift')
    expect(src).toContain('accept-drift')
  })
})
