// Phase 1 Plan 01-10 (GATE-02): unit tests for the DTC_LLM_MODE=fixture helper.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isFixtureMode, loadFixture, FixtureModeError } from '../src/llm-fixture.js'

describe('llm-fixture', () => {
  let dir: string
  const prevMode = process.env.DTC_LLM_MODE
  const prevDir = process.env.DTC_LLM_FIXTURES_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtc-fix-'))
    process.env.DTC_LLM_FIXTURES_DIR = dir
  })

  afterEach(() => {
    if (prevMode === undefined) delete process.env.DTC_LLM_MODE
    else process.env.DTC_LLM_MODE = prevMode
    if (prevDir === undefined) delete process.env.DTC_LLM_FIXTURES_DIR
    else process.env.DTC_LLM_FIXTURES_DIR = prevDir
    rmSync(dir, { recursive: true, force: true })
  })

  it('isFixtureMode returns false when DTC_LLM_MODE is unset', () => {
    delete process.env.DTC_LLM_MODE
    expect(isFixtureMode()).toBe(false)
  })

  it('isFixtureMode returns true when DTC_LLM_MODE=fixture', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    expect(isFixtureMode()).toBe(true)
  })

  it('loadFixture returns the cassette when the file exists', () => {
    const cassette = {
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 1, output_tokens: 2 },
    }
    writeFileSync(join(dir, 'codegen.json'), JSON.stringify(cassette))
    expect(loadFixture('codegen')).toEqual(cassette)
  })

  it('loadFixture throws FixtureModeError with actionable message when cassette missing', () => {
    expect(() => loadFixture('missing')).toThrowError(FixtureModeError)
    try {
      loadFixture('missing')
    } catch (err) {
      expect((err as Error).message).toMatch(/DTC_LLM_MODE=fixture/)
      expect((err as Error).message).toMatch(/missing\.json/)
    }
  })

  it('loadFixture throws FixtureModeError when cassette shape is wrong', () => {
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ nope: true }))
    expect(() => loadFixture('bad')).toThrowError(FixtureModeError)
  })
})
