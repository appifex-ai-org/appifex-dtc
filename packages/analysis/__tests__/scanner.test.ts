import { describe, it, expect } from 'vitest'
import { scanProject } from '../src/scanner.js'
import type { Runner, RunnerCapabilities } from '@appifex/core'

/** Minimal mock Runner for testing scanner */
function createMockRunner(files: Record<string, string>): Runner {
  const caps: RunnerCapabilities = {
    hasMaestro: false,
    hasXcode: false,
    hasNode: true,
    hasSemgrep: false,
    platform: 'darwin',
  }
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

describe('scanProject', () => {
  // Test 1: empty array for no source files
  it('returns empty array for directory with no source files', async () => {
    const runner = createMockRunner({})
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toEqual([])
  })

  // Test 2: SwiftUI View struct → screen
  it('classifies a SwiftUI View struct file as screen', async () => {
    const runner = createMockRunner({
      '/project/HomeView.swift': 'struct HomeView: View { var body: some View { Text("Hi") } }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('screen')
    expect(result[0].name).toBe('HomeView')
  })

  // Test 3: ObservableObject class → component
  it('classifies an ObservableObject class as component', async () => {
    const runner = createMockRunner({
      '/project/HomeViewModel.swift': '@Observable class HomeViewModel { }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('component')
    expect(result[0].name).toBe('HomeViewModel')
  })

  // Test 4: Codable struct → model
  it('classifies a Codable struct as model', async () => {
    const runner = createMockRunner({
      '/project/Todo.swift': 'struct Todo: Codable, Identifiable { let id: UUID }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('model')
    expect(result[0].name).toBe('Todo')
  })

  // Test 5: Service class → service
  it('classifies a Service class as service', async () => {
    const runner = createMockRunner({
      '/project/APIService.swift': 'class APIService { }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('service')
    expect(result[0].name).toBe('APIService')
  })

  // Test 6: Kotlin @Composable fun XxxScreen → screen
  it('classifies Kotlin @Composable fun XxxScreen as screen', async () => {
    const runner = createMockRunner({
      '/project/HomeScreen.kt': '@Composable\nfun HomeScreen() { }',
    })
    const result = await scanProject('/project', 'kotlin-compose', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('screen')
    expect(result[0].name).toBe('HomeScreen')
  })

  // Test 7: Kotlin ViewModel → component
  it('classifies Kotlin ViewModel as component', async () => {
    const runner = createMockRunner({
      '/project/HomeViewModel.kt': 'class HomeViewModel : ViewModel() { }',
    })
    const result = await scanProject('/project', 'kotlin-compose', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('component')
    expect(result[0].name).toBe('HomeViewModel')
  })

  // Test 8: Kotlin data class → model
  it('classifies Kotlin data class as model', async () => {
    const runner = createMockRunner({
      '/project/Todo.kt': 'data class Todo(val id: String, val title: String)',
    })
    const result = await scanProject('/project', 'kotlin-compose', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('model')
    expect(result[0].name).toBe('Todo')
  })

  // Test 9: Kotlin Repository/Service → service
  it('classifies Kotlin Repository/Service as service', async () => {
    const runner = createMockRunner({
      '/project/TodoRepository.kt': 'class TodoRepository { }',
    })
    const result = await scanProject('/project', 'kotlin-compose', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('service')
    expect(result[0].name).toBe('TodoRepository')
  })

  // Test 10: relative file paths
  it('returns relative file paths (not absolute)', async () => {
    const runner = createMockRunner({
      '/project/Views/HomeView.swift':
        'struct HomeView: View { var body: some View { Text("Hi") } }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe('Views/HomeView.swift')
    expect(result[0].filePath.startsWith('/')).toBe(false)
  })

  // Test 11: correct name extraction
  it('extracts the correct name from the struct/class/fun declaration', async () => {
    const runner = createMockRunner({
      '/project/SettingsView.swift':
        'import SwiftUI\n\nstruct SettingsView: View {\n  var body: some View { Text("Settings") }\n}',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('SettingsView')
  })

  // Test 13: classifies View struct with component suffix as component (not screen)
  it('classifies a View struct with component suffix (Row, Cell, Card, etc.) as component', async () => {
    const runner = createMockRunner({
      '/project/TodoRow.swift':
        'struct TodoRow: View { var body: some View { HStack { Text("item") } } }',
      '/project/ProfileCard.swift':
        'struct ProfileCard: View { var body: some View { VStack { Text("name") } } }',
      '/project/StarIcon.swift':
        'struct StarIcon: View { var body: some View { Image(systemName: "star") } }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(3)
    expect(result.every((e) => e.type === 'component')).toBe(true)
  })

  // Test 14: classifies View struct with navigation markers as screen even with component-like name
  it('classifies a View struct with NavigationStack as screen regardless of name', async () => {
    const runner = createMockRunner({
      '/project/MainTab.swift':
        'struct MainTab: View { var body: some View { NavigationStack { List { } } } }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('screen')
  })

  // Test 15: classifies View struct without component suffix and without nav markers as screen
  it('classifies View struct like HomeView or ContentView as screen', async () => {
    const runner = createMockRunner({
      '/project/HomeView.swift': 'struct HomeView: View { var body: some View { Text("home") } }',
      '/project/ContentView.swift':
        'struct ContentView: View { var body: some View { Text("content") } }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(2)
    expect(result.every((e) => e.type === 'screen')).toBe(true)
  })

  // Test 16: does not demote Kotlin composables (only SwiftUI refinement)
  it('does not demote Kotlin @Composable views with component suffixes', async () => {
    const runner = createMockRunner({
      '/project/TodoItemScreen.kt': '@Composable\nfun TodoItemScreen() { }',
    })
    const result = await scanProject('/project', 'kotlin-compose', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('screen')
  })

  // Test 12: skips comment lines when matching
  it('skips comment lines when matching', async () => {
    const runner = createMockRunner({
      '/project/Commented.swift':
        '// struct FakeView: View { }\n/* struct AnotherView: View { } */\nclass APIService { }',
    })
    const result = await scanProject('/project', 'swiftui', runner)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('service')
    expect(result[0].name).toBe('APIService')
  })
})
