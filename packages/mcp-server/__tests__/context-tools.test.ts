import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleLoadContext, handleSaveContext } from '../src/tools/config.js'
import { saveRunContext } from '@appifex/core'
import type { RunContext } from '@appifex/core'

function makeContext(): RunContext {
  return {
    runId: 'run-test',
    prompt: 'Build a todo app',
    platform: 'swiftui',
    mode: 'fresh',
    status: 'completed',
    timestamp: Date.now(),
    phases: { design: { status: 'completed', summary: 'Done' } },
    filesGenerated: ['Sources/App.swift'],
  }
}

describe('dtc_load_context handler', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtc-mcp-ctx-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns found: false when no context exists', async () => {
    const result = await handleLoadContext({ outputDir: dir })
    const parsed = JSON.parse(result.text)
    expect(parsed.found).toBe(false)
  })

  it('returns the saved context when it exists', async () => {
    const ctx = makeContext()
    await saveRunContext(dir, ctx)

    const result = await handleLoadContext({ outputDir: dir })
    const parsed = JSON.parse(result.text)
    expect(parsed.found).toBe(true)
    expect(parsed.context.prompt).toBe('Build a todo app')
  })
})

describe('dtc_save_context handler', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtc-mcp-ctx-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves a context and can be loaded back', async () => {
    const ctx = makeContext()
    const saveResult = await handleSaveContext({ outputDir: dir, contextJson: JSON.stringify(ctx) })
    expect(saveResult.isError).toBe(false)

    const loadResult = await handleLoadContext({ outputDir: dir })
    const parsed = JSON.parse(loadResult.text)
    expect(parsed.found).toBe(true)
    expect(parsed.context.runId).toBe('run-test')
  })

  it('returns error for invalid JSON', async () => {
    const result = await handleSaveContext({ outputDir: dir, contextJson: 'not json' })
    expect(result.isError).toBe(true)
  })
})
