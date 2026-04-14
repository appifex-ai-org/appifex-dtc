import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Runner, RunnerCapabilities, InventoryEntry } from '@appifex/core'

// Mock the scanner module so diffScreenInventory receives a deterministic inventory
// without us having to exercise scanProject's internals.
vi.mock('../src/scanner.js', () => ({
  scanProject: vi.fn(),
}))

import { diffScreenInventory } from '../src/modified-screens.js'
import { scanProject } from '../src/scanner.js'

const mockedScanProject = vi.mocked(scanProject)

const caps: RunnerCapabilities = {
  hasMaestro: false,
  hasXcode: false,
  hasNode: true,
  hasSemgrep: false,
  platform: 'darwin',
}

/** Minimal mock Runner where readFile is backed by a file map. */
function createMockRunner(files: Record<string, string>): Runner {
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async (path: string) => {
      const content = files[path]
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    writeFile: async () => {},
    exists: async (path: string) => path in files,
    glob: async (_pattern: string) => Object.keys(files),
    capabilities: caps,
  }
}

beforeEach(() => {
  mockedScanProject.mockReset()
})

describe('diffScreenInventory', () => {
  const outputDir = '/tmp/dtc-test'

  it('classifies a new screen file (absent from pre-run snapshot) as added', async () => {
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/NewScreen.swift', type: 'screen', name: 'NewScreen' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/NewScreen.swift': 'new screen content',
    })
    const preSnapshot = new Map<string, string>() // empty — nothing exists yet

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    expect(result).toEqual({ added: ['NewScreen'], modified: [] })
  })

  it('classifies a pre-existing screen whose SHA-256 changed as modified', async () => {
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/OldScreen.swift', type: 'screen', name: 'OldScreen' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/OldScreen.swift': 'modified content',
    })
    const preSnapshot = new Map<string, string>([
      ['/tmp/dtc-test/Sources/OldScreen.swift', 'original content'],
    ])

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    expect(result).toEqual({ added: [], modified: ['OldScreen'] })
  })

  it('returns empty classifications when a pre-existing screen is byte-identical', async () => {
    const identical = 'exact same content\nwith newline'
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/UnchangedScreen.swift', type: 'screen', name: 'UnchangedScreen' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/UnchangedScreen.swift': identical,
    })
    const preSnapshot = new Map<string, string>([
      ['/tmp/dtc-test/Sources/UnchangedScreen.swift', identical],
    ])

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    expect(result).toEqual({ added: [], modified: [] })
  })

  it('normalizes absolute snapshot keys against relative scanProject paths (Pitfall 2)', async () => {
    // Snapshot uses absolute paths (as raw runner.glob() would emit).
    // Inventory uses RELATIVE paths (as scanProject normalizes via relative()).
    // The module must strip `${outputDir}/` so both sides line up.
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/X.swift', type: 'screen', name: 'X' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/X.swift': 'same content',
    })
    const preSnapshot = new Map<string, string>([['/tmp/dtc-test/Sources/X.swift', 'same content']])

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    // If normalization were broken, the snapshot key wouldn't match the relative
    // inventory path, X would be misclassified as "added".
    expect(result.added).not.toContain('X')
    expect(result.modified).not.toContain('X')
    expect(result).toEqual({ added: [], modified: [] })
  })

  it('returns empty sets when preSnapshot is empty and no screens exist post-codegen', async () => {
    mockedScanProject.mockResolvedValue([])
    const runner = createMockRunner({})
    const preSnapshot = new Map<string, string>()

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    expect(result).toEqual({ added: [], modified: [] })
  })

  it('ignores non-screen inventory entries (component, model, service)', async () => {
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/NewScreen.swift', type: 'screen', name: 'NewScreen' },
      { filePath: 'Sources/TodoRow.swift', type: 'component', name: 'TodoRow' },
      { filePath: 'Sources/Todo.swift', type: 'model', name: 'Todo' },
      { filePath: 'Sources/APIService.swift', type: 'service', name: 'APIService' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/NewScreen.swift': 'new screen',
      '/tmp/dtc-test/Sources/TodoRow.swift': 'component',
      '/tmp/dtc-test/Sources/Todo.swift': 'model',
      '/tmp/dtc-test/Sources/APIService.swift': 'service',
    })
    const preSnapshot = new Map<string, string>()

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    // Only NewScreen (the screen) should surface — the component/model/service are ignored
    // even though they're also absent from the preSnapshot.
    expect(result).toEqual({ added: ['NewScreen'], modified: [] })
  })

  it('handles an outputDir that already ends with a trailing slash', async () => {
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/Y.swift', type: 'screen', name: 'Y' },
    ] as InventoryEntry[])
    const runner = createMockRunner({
      '/tmp/dtc-test/Sources/Y.swift': 'same',
    })
    const preSnapshot = new Map<string, string>([['/tmp/dtc-test/Sources/Y.swift', 'same']])

    const result = await diffScreenInventory('/tmp/dtc-test/', 'swiftui', runner, preSnapshot)

    expect(result).toEqual({ added: [], modified: [] })
  })

  it('treats runner.readFile failure during diff as unchanged (no crash)', async () => {
    mockedScanProject.mockResolvedValue([
      { filePath: 'Sources/Vanished.swift', type: 'screen', name: 'Vanished' },
    ] as InventoryEntry[])
    // The runner's file map does NOT contain Vanished — readFile will throw.
    const runner = createMockRunner({})
    const preSnapshot = new Map<string, string>([
      ['/tmp/dtc-test/Sources/Vanished.swift', 'previous content'],
    ])

    const result = await diffScreenInventory(outputDir, 'swiftui', runner, preSnapshot)

    // Neither classified as modified (readFile failed) nor as added (it IS in snapshot).
    expect(result).toEqual({ added: [], modified: [] })
  })
})
