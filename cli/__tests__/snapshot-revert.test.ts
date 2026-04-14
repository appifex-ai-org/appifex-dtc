import { describe, it, expect, vi } from 'vitest'
import { snapshotSourceFiles, revertUnexpectedChanges } from '../src/pipeline.js'
import type { Runner, ModificationPlan } from '@appifex/core'

function createMockRunner(globResult: string[], fileContents: Record<string, string> = {}): Runner {
  return {
    glob: vi.fn().mockResolvedValue(globResult),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path in fileContents) return Promise.resolve(fileContents[path])
      return Promise.reject(new Error(`File not found: ${path}`))
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    exec: vi.fn(),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  }
}

describe('snapshotSourceFiles', () => {
  it('captures all .swift files in Sources/ for swiftui platform', async () => {
    const files = ['Sources/ContentView.swift', 'Sources/Models/Item.swift']
    const contents = {
      'Sources/ContentView.swift': 'struct ContentView {}',
      'Sources/Models/Item.swift': 'struct Item {}',
    }
    const runner = createMockRunner(files, contents)

    const snapshot = await snapshotSourceFiles(runner, 'swiftui')

    expect(runner.glob).toHaveBeenCalledWith('Sources/**/*.swift')
    expect(snapshot.size).toBe(2)
    expect(snapshot.get('Sources/ContentView.swift')).toBe('struct ContentView {}')
    expect(snapshot.get('Sources/Models/Item.swift')).toBe('struct Item {}')
  })

  it('uses app/src/main/**/*.kt glob for kotlin-compose platform', async () => {
    const files = ['app/src/main/MainActivity.kt']
    const contents = { 'app/src/main/MainActivity.kt': 'class MainActivity {}' }
    const runner = createMockRunner(files, contents)

    const snapshot = await snapshotSourceFiles(runner, 'kotlin-compose')

    expect(runner.glob).toHaveBeenCalledWith('app/src/main/**/*.kt')
    expect(snapshot.size).toBe(1)
    expect(snapshot.get('app/src/main/MainActivity.kt')).toBe('class MainActivity {}')
  })

  it('excludes __tests__ and build directories', async () => {
    const files = [
      'Sources/App.swift',
      '__tests__/Test.swift',
      'build/output.swift',
      '.dtc-debug/Debug.swift',
      'node_modules/Dep.swift',
    ]
    const contents = {
      'Sources/App.swift': 'struct App {}',
      '__tests__/Test.swift': 'struct AppTests {}',
      'build/output.swift': 'struct Build {}',
      '.dtc-debug/Debug.swift': 'struct Debug {}',
      'node_modules/Dep.swift': 'struct Dep {}',
    }
    const runner = createMockRunner(files, contents)

    const snapshot = await snapshotSourceFiles(runner, 'swiftui')

    expect(snapshot.size).toBe(1)
    expect(snapshot.has('Sources/App.swift')).toBe(true)
    expect(snapshot.has('__tests__/Test.swift')).toBe(false)
    expect(snapshot.has('build/output.swift')).toBe(false)
    expect(snapshot.has('.dtc-debug/Debug.swift')).toBe(false)
    expect(snapshot.has('node_modules/Dep.swift')).toBe(false)
  })

  it('skips files that cannot be read', async () => {
    const files = ['Sources/Good.swift', 'Sources/Unreadable.swift']
    const contents = { 'Sources/Good.swift': 'struct Good {}' }
    // 'Sources/Unreadable.swift' is not in contents, so readFile will reject it
    const runner = createMockRunner(files, contents)

    const snapshot = await snapshotSourceFiles(runner, 'swiftui')

    expect(snapshot.size).toBe(1)
    expect(snapshot.has('Sources/Good.swift')).toBe(true)
    expect(snapshot.has('Sources/Unreadable.swift')).toBe(false)
  })
})

describe('revertUnexpectedChanges', () => {
  it('reverts file changed outside modification plan', async () => {
    const snapshot = new Map([
      ['Sources/HomeView.swift', 'original home'],
      ['Sources/ContentView.swift', 'original content'],
    ])
    const modificationPlan: ModificationPlan = {
      items: [
        { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add tab', changeType: 'navigation', fileContent: 'original content' },
      ],
    }
    const fileContents: Record<string, string> = {
      'Sources/HomeView.swift': 'changed home',
      'Sources/ContentView.swift': 'changed content',
    }
    const runner = createMockRunner([], fileContents)
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    // HomeView was changed but NOT in plan — should be reverted
    expect(writeSpy).toHaveBeenCalledWith('Sources/HomeView.swift', 'original home')
    // ContentView was changed but IS in plan — should NOT be reverted
    expect(writeSpy).not.toHaveBeenCalledWith('Sources/ContentView.swift', expect.anything())
    expect(reverted).toContain('Sources/HomeView.swift')
    expect(reverted).not.toContain('Sources/ContentView.swift')
  })

  it('preserves file in modification plan even if changed', async () => {
    const snapshot = new Map([
      ['Sources/ContentView.swift', 'original'],
    ])
    const modificationPlan: ModificationPlan = {
      items: [
        { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add tab', changeType: 'navigation', fileContent: 'original' },
      ],
    }
    const runner = createMockRunner([], { 'Sources/ContentView.swift': 'modified' })
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    // ContentView is in plan — must NOT be reverted
    expect(writeSpy).not.toHaveBeenCalled()
    expect(reverted).toHaveLength(0)
  })

  it('does NOT touch new files not in snapshot', async () => {
    // Snapshot has only A.swift. Agent created B.swift (not in snapshot).
    const snapshot = new Map([
      ['Sources/A.swift', 'original A'],
    ])
    const modificationPlan: ModificationPlan = { items: [] }
    // A.swift is unchanged; B.swift exists but was not in snapshot
    const runner = createMockRunner([], {
      'Sources/A.swift': 'original A',
      'Sources/B.swift': 'brand new B',
    })
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    // B.swift was not in snapshot, so the loop never encounters it — no write
    expect(writeSpy).not.toHaveBeenCalledWith('Sources/B.swift', expect.anything())
    expect(reverted).toHaveLength(0)
  })

  it('returns list of reverted file paths', async () => {
    const snapshot = new Map([
      ['Sources/A.swift', 'original A'],
      ['Sources/B.swift', 'original B'],
      ['Sources/C.swift', 'original C'],
    ])
    const modificationPlan: ModificationPlan = {
      items: [
        { filePath: 'Sources/C.swift', screenName: 'C', changeDescription: 'Update', changeType: 'layout', fileContent: 'original C' },
      ],
    }
    const runner = createMockRunner([], {
      'Sources/A.swift': 'changed A',
      'Sources/B.swift': 'original B', // unchanged — should NOT be reverted
      'Sources/C.swift': 'changed C',  // in plan — should NOT be reverted
    })
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    expect(reverted).toEqual(['Sources/A.swift'])
    expect(reverted).not.toContain('Sources/B.swift')
    expect(reverted).not.toContain('Sources/C.swift')
  })

  it('restores deleted files that were in snapshot but not in modification plan', async () => {
    const snapshot = new Map([
      ['Sources/HomeView.swift', 'original home'],
    ])
    const modificationPlan: ModificationPlan = { items: [] }
    // HomeView was deleted — readFile rejects
    const runner = createMockRunner([], {})
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    // File was deleted and not in plan — restore it
    expect(writeSpy).toHaveBeenCalledWith('Sources/HomeView.swift', 'original home')
    expect(reverted).toContain('Sources/HomeView.swift')
  })

  it('returns empty list when no unexpected changes occurred', async () => {
    const snapshot = new Map([
      ['Sources/ContentView.swift', 'unchanged'],
    ])
    const modificationPlan: ModificationPlan = { items: [] }
    const runner = createMockRunner([], { 'Sources/ContentView.swift': 'unchanged' })
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    runner.writeFile = writeSpy

    const reverted = await revertUnexpectedChanges(runner, snapshot, modificationPlan)

    expect(writeSpy).not.toHaveBeenCalled()
    expect(reverted).toHaveLength(0)
  })
})
