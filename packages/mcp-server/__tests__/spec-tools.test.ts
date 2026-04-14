import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleSpecExtract, handleSpecTranslate } from '../src/tools/spec.js'

const SAMPLE_PEN = JSON.stringify({
  version: '1',
  children: [
    {
      type: 'frame',
      name: 'Home',
      width: 390,
      height: 844,
      children: [
        { type: 'text', name: 'Title', content: 'Welcome', fontSize: 24, fontWeight: 'bold' },
        {
          type: 'button',
          name: 'Start Button',
          children: [{ type: 'text', name: 'Label', content: 'Get Started' }],
        },
      ],
    },
  ],
})

describe('dtc_spec_extract handler', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtc-mcp-spec-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('extracts spec from a .pen file', async () => {
    const penPath = join(dir, 'design.pen')
    writeFileSync(penPath, SAMPLE_PEN)

    const result = await handleSpecExtract({ filePath: penPath })

    expect(result.isError).toBe(false)
    const spec = JSON.parse(result.text)
    expect(spec.screens).toHaveLength(1)
    expect(spec.screens[0].name).toBe('Home')
  })

  it('returns error for missing file', async () => {
    const result = await handleSpecExtract({ filePath: '/nonexistent/file.pen' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('failed')
  })
})

describe('dtc_spec_translate handler', () => {
  it('translates a DesignSpec to SwiftUI PlatformSpec', async () => {
    const penPath = join(mkdtempSync(join(tmpdir(), 'dtc-mcp-spec-')), 'design.pen')
    writeFileSync(penPath, SAMPLE_PEN)
    const extractResult = await handleSpecExtract({ filePath: penPath })
    const spec = JSON.parse(extractResult.text)

    const result = await handleSpecTranslate({
      specJson: JSON.stringify(spec),
      platform: 'swiftui',
    })

    expect(result.isError).toBe(false)
    const platformSpec = JSON.parse(result.text)
    expect(platformSpec.platform).toBe('swiftui')
    expect(platformSpec.screens[0].componentName).toContain('View')
  })

  it('returns error for invalid JSON', async () => {
    const result = await handleSpecTranslate({ specJson: 'not json', platform: 'swiftui' })
    expect(result.isError).toBe(true)
  })
})
