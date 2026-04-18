// Phase 7 (OBS-03): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
// @ts-expect-error — module does not exist yet; RED until Plan 03 creates packages/core/src/debug-bundle.ts
import { writeDebugBundle } from '../src/debug-bundle.js'

describe('writeDebugBundle (OBS-03)', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'dtc-bundle-'))
    // Seed required directories and files
    mkdirSync(join(outputDir, '.dtc-debug'), { recursive: true })
    mkdirSync(join(outputDir, '.dtc'), { recursive: true })
    mkdirSync(join(outputDir, '.dtc-report'), { recursive: true })

    writeFileSync(join(outputDir, '.dtc', 'run-context.json'), JSON.stringify({ runId: 'run-test' }))
    writeFileSync(join(outputDir, '.dtc-report', 'report.json'), JSON.stringify({ status: 'completed' }))
    writeFileSync(join(outputDir, '.dtc-debug', 'debug.log'), 'some debug output')
  })

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true })
  })

  it('returns path to bundle zip under .dtc-debug/', async () => {
    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    expect(bundlePath).toMatch(/\.dtc-debug\/bundle-.*\.zip$/)
    expect(bundlePath.startsWith(outputDir)).toBe(true)
  })

  it('zip exists and is > 0 bytes', async () => {
    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    const stat = statSync(bundlePath)
    expect(stat.size).toBeGreaterThan(0)
  })

  it('zip contains expected entries', async () => {
    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    // Shell out via unzip -l to list contents
    const listing = execSync(`unzip -l "${bundlePath}"`, { encoding: 'utf8' })
    // Should include the debug log and run-context
    expect(listing).toMatch(/debug\.log|run-context\.json|report\.json/)
  })

  it('scrubber redacts Anthropic API key pattern (sk-ant-)', async () => {
    writeFileSync(
      join(outputDir, '.dtc-debug', 'fake.log'),
      'calling API with key sk-ant-aaaaaaaaaa and some other data',
    )

    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    // Extract and read the fake.log from the zip
    const extracted = execSync(`unzip -p "${bundlePath}" debug/fake.log 2>/dev/null || unzip -p "${bundlePath}" fake.log`, {
      encoding: 'utf8',
    })
    expect(extracted).toContain('[REDACTED]')
    expect(extracted).not.toContain('sk-ant-aaaaaaaaaa')
  })

  it('scrubber redacts OpenAI API key pattern (sk-)', async () => {
    writeFileSync(
      join(outputDir, '.dtc-debug', 'fake.log'),
      'openai key sk-bbbbbbbbbbbbbbbbbbbb in logs',
    )

    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    const extracted = execSync(`unzip -p "${bundlePath}" debug/fake.log 2>/dev/null || unzip -p "${bundlePath}" fake.log`, {
      encoding: 'utf8',
    })
    expect(extracted).toContain('[REDACTED]')
    expect(extracted).not.toContain('sk-bbbbbbbbbbbbbbbbbbbb')
  })

  it('scrubber redacts apiKey JSON pattern', async () => {
    writeFileSync(
      join(outputDir, '.dtc-debug', 'fake.log'),
      '{"apiKey": "secret123", "other": "value"}',
    )

    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    const extracted = execSync(`unzip -p "${bundlePath}" debug/fake.log 2>/dev/null || unzip -p "${bundlePath}" fake.log`, {
      encoding: 'utf8',
    })
    expect(extracted).toContain('[REDACTED]')
    expect(extracted).not.toContain('secret123')
  })

  it('scrubber redacts private_key pattern', async () => {
    writeFileSync(
      join(outputDir, '.dtc-debug', 'fake.log'),
      '{"private_key": "xyz", "project_id": "test"}',
    )

    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    const extracted = execSync(`unzip -p "${bundlePath}" debug/fake.log 2>/dev/null || unzip -p "${bundlePath}" fake.log`, {
      encoding: 'utf8',
    })
    expect(extracted).toContain('[REDACTED]')
  })

  it('scrubber redacts PEM private key block', async () => {
    writeFileSync(
      join(outputDir, '.dtc-debug', 'fake.log'),
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
    )

    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })

    const extracted = execSync(`unzip -p "${bundlePath}" debug/fake.log 2>/dev/null || unzip -p "${bundlePath}" fake.log`, {
      encoding: 'utf8',
    })
    expect(extracted).toContain('[REDACTED]')
    expect(extracted).not.toContain('BEGIN PRIVATE KEY')
  })

  it('does NOT include the bundle zip itself in its own contents', async () => {
    const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })
    const bundleFileName = bundlePath.split('/').pop()!

    const listing = execSync(`unzip -l "${bundlePath}"`, { encoding: 'utf8' })
    expect(listing).not.toContain(bundleFileName)
  })
})
