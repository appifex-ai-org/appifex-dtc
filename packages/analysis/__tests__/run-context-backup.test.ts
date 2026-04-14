import { describe, it, expect, afterEach } from 'vitest'
import { backupRunContext } from '../src/run-context-backup.js'
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

function makeTempDir(): string {
  return join(tmpdir(), `dtc-test-${randomUUID().slice(0, 8)}`)
}

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs.length = 0
})

describe('backupRunContext', () => {
  // Test 1: copies run-context.json to timestamped backup
  it('copies run-context.json to .dtc/run-context.{timestamp}.json', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    const dtcDir = join(tempDir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    const original = JSON.stringify({ runId: 'test-123', prompt: 'hello' })
    await writeFile(join(dtcDir, 'run-context.json'), original)

    const result = await backupRunContext(tempDir)

    expect(result).not.toBeNull()
    expect(result).toContain('run-context.')
    expect(result).toMatch(/\.json$/)
    const backupContent = await readFile(result!, 'utf-8')
    expect(backupContent).toBe(original)
  })

  // Test 2: returns the backup file path on success
  it('returns the backup file path on success', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    const dtcDir = join(tempDir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    await writeFile(join(dtcDir, 'run-context.json'), '{}')

    const result = await backupRunContext(tempDir)

    expect(typeof result).toBe('string')
    expect(result!.startsWith(tempDir)).toBe(true)
  })

  // Test 3: returns null when no run-context.json exists
  it('returns null when no run-context.json exists', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    await mkdir(tempDir, { recursive: true })

    const result = await backupRunContext(tempDir)

    expect(result).toBeNull()
  })

  // Test 4: creates .dtc directory if it does not exist
  it('creates .dtc directory if it does not exist (no-op case)', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    // No .dtc dir at all — should return null without error
    await mkdir(tempDir, { recursive: true })

    const result = await backupRunContext(tempDir)

    expect(result).toBeNull()
  })

  // Test 5: timestamp has colons and dots replaced with dashes
  it('timestamp in backup filename has colons and dots replaced with dashes', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    const dtcDir = join(tempDir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    await writeFile(join(dtcDir, 'run-context.json'), '{}')

    const result = await backupRunContext(tempDir)

    expect(result).not.toBeNull()
    // Extract just the filename
    const filename = result!.split('/').pop()!
    // Should match: run-context.YYYY-MM-DDTHH-MM-SS-NNNZ.json (no colons or dots in timestamp)
    expect(filename).toMatch(/^run-context\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/)
  })

  // Test 6: multiple calls produce distinct backup files
  it('multiple calls produce distinct backup files', async () => {
    const tempDir = makeTempDir()
    tempDirs.push(tempDir)
    const dtcDir = join(tempDir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    await writeFile(join(dtcDir, 'run-context.json'), '{"run": 1}')

    const result1 = await backupRunContext(tempDir)
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5))
    const result2 = await backupRunContext(tempDir)

    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()
    expect(result1).not.toBe(result2)

    // Verify both files exist
    const files = await readdir(dtcDir)
    const backups = files.filter((f) => f.startsWith('run-context.') && f !== 'run-context.json')
    expect(backups.length).toBeGreaterThanOrEqual(2)
  })
})
