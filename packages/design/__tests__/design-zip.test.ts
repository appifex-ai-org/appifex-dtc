import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { extractDesignZip } from '../src/design-zip.js'

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dtc-design-zip-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

/** Create a zip file from a map of relative paths → contents */
function createZip(zipPath: string, files: Record<string, string | Buffer>): void {
  // Write files to a staging dir, then zip them
  const staging = join(workDir, '_staging')
  const { mkdirSync } = require('node:fs')
  mkdirSync(staging, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(staging, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
  execSync(`cd "${staging}" && zip -r "${zipPath}" .`, { stdio: 'ignore' })
}

describe('extractDesignZip', () => {
  it('finds HTML and PNG in a flat zip', async () => {
    const zipPath = join(workDir, 'export.zip')
    createZip(zipPath, {
      'screen1.html': '<html><body>Hello</body></html>',
      'screen1.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
    })

    const result = await extractDesignZip(zipPath, workDir)

    expect(result.htmlPaths).toHaveLength(1)
    expect(result.htmlPaths[0]).toContain('screen1.html')
    expect(result.screenshotPaths).toHaveLength(1)
    expect(result.screenshotPaths[0]).toContain('screen1.png')
    expect(result.extractDir).toContain('.design-import')
  })

  it('finds artifacts in nested subdirectories', async () => {
    const zipPath = join(workDir, 'nested.zip')
    createZip(zipPath, {
      'project/screens/login.html': '<html></html>',
      'project/screens/login.png': Buffer.from([0x89, 0x50]),
      'project/screens/home.html': '<html></html>',
      'project/screens/home.png': Buffer.from([0x89, 0x50]),
    })

    const result = await extractDesignZip(zipPath, workDir)

    expect(result.htmlPaths).toHaveLength(2)
    expect(result.screenshotPaths).toHaveLength(2)
  })

  it('finds design.md case-insensitively', async () => {
    const zipPath = join(workDir, 'upper.zip')
    createZip(zipPath, {
      'DESIGN.md': '# Design System\n## Colors\n- primary: #FF0000',
      'screen.html': '<html></html>',
    })

    const result = await extractDesignZip(zipPath, workDir)
    expect(result.designMdPath).toBeDefined()

    // Also test lowercase
    const zipPath2 = join(workDir, 'lower.zip')
    createZip(zipPath2, {
      'design.md': '# Design System',
      'screen.html': '<html></html>',
    })

    const outputDir2 = join(workDir, 'out2')
    const result2 = await extractDesignZip(zipPath2, outputDir2)
    expect(result2.designMdPath).toBeDefined()
  })

  it('returns undefined designMdPath when no design.md present', async () => {
    const zipPath = join(workDir, 'no-md.zip')
    createZip(zipPath, {
      'screen.html': '<html></html>',
      'screen.png': Buffer.from([0x89]),
    })

    const result = await extractDesignZip(zipPath, workDir)
    expect(result.designMdPath).toBeUndefined()
    expect(result.htmlPaths).toHaveLength(1)
    expect(result.screenshotPaths).toHaveLength(1)
  })

  it('throws for non-existent file', async () => {
    await expect(extractDesignZip('/tmp/does-not-exist.zip', workDir)).rejects.toThrow()
  })
})
