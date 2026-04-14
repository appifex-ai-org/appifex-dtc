import { describe, it, expect } from 'vitest'
import { buildNavGraph } from '../src/nav-graph.js'
import type { Runner, RunnerCapabilities } from '@appifex/core'

/** Minimal mock Runner for testing nav graph */
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

describe('buildNavGraph', () => {
  // Test 1: empty array for directory with no source files
  it('returns empty array for directory with no source files', async () => {
    const runner = createMockRunner({})
    const result = await buildNavGraph('/project', 'swiftui', runner)
    expect(result.nodes).toEqual([])
    expect(result.entryPoint).toBeNull()
  })

  // Test 2: SwiftUI TabView as 'tab' NavNode
  it('detects SwiftUI TabView as tab NavNode with child screen targets', async () => {
    const runner = createMockRunner({
      '/project/ContentView.swift': `
struct ContentView: View {
  var body: some View {
    TabView {
      HomeView()
        .tabItem { Label("Home", systemImage: "house") }
      SettingsView()
        .tabItem { Label("Settings", systemImage: "gear") }
    }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    const tabNode = result.nodes.find((n) => n.type === 'tab')
    expect(tabNode).toBeDefined()
    expect(tabNode!.targets).toContain('HomeView')
    expect(tabNode!.targets).toContain('SettingsView')
  })

  // Test 3: NavigationLink as 'push' NavNode
  it('detects NavigationLink as push NavNode', async () => {
    const runner = createMockRunner({
      '/project/ListView.swift': `
struct ListView: View {
  var body: some View {
    NavigationLink(destination: DetailView()) {
      Text("Go to detail")
    }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    const pushNode = result.nodes.find((n) => n.type === 'push')
    expect(pushNode).toBeDefined()
    expect(pushNode!.targets).toContain('DetailView')
  })

  // Test 4: .sheet() as 'modal' NavNode
  it('detects .sheet() as modal NavNode', async () => {
    const runner = createMockRunner({
      '/project/MainView.swift': `
struct MainView: View {
  @State private var showModal = false
  var body: some View {
    Button("Open") { showModal = true }
      .sheet(isPresented: $showModal) {
        ModalView()
      }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    const modalNode = result.nodes.find((n) => n.type === 'modal')
    expect(modalNode).toBeDefined()
    expect(modalNode!.targets).toContain('ModalView')
  })

  // Test 5: NavigationSplitView as 'drawer' NavNode
  it('detects NavigationSplitView as drawer NavNode', async () => {
    const runner = createMockRunner({
      '/project/SidebarView.swift': `
struct SidebarView: View {
  var body: some View {
    NavigationSplitView {
      SidebarContent()
    } detail: {
      DetailContent()
    }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    const drawerNode = result.nodes.find((n) => n.type === 'drawer')
    expect(drawerNode).toBeDefined()
  })

  // Test 6: @main struct + WindowGroup as entry point (per D-06)
  it('detects @main struct + WindowGroup content as entry point', async () => {
    const runner = createMockRunner({
      '/project/MyApp.swift': `
@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}`,
      '/project/ContentView.swift':
        'struct ContentView: View { var body: some View { Text("Hi") } }',
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    expect(result.entryPoint).toBe('ContentView')
  })

  // Test 7: Kotlin NavHost with composable routes
  it('detects Kotlin NavHost with composable routes', async () => {
    const runner = createMockRunner({
      '/project/NavGraph.kt': `
@Composable
fun AppNavigation() {
  NavHost(navController = navController, startDestination = "home") {
    composable("home") { HomeScreen() }
    composable("profile") { ProfileScreen() }
    composable("settings") { SettingsScreen() }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'kotlin-compose', runner)
    const pushNodes = result.nodes.filter((n) => n.type === 'push')
    expect(pushNodes.length).toBeGreaterThanOrEqual(1)
    const allTargets = pushNodes.flatMap((n) => n.targets)
    expect(allTargets).toContain('home')
    expect(allTargets).toContain('profile')
    expect(allTargets).toContain('settings')
  })

  // Test 8: Kotlin BottomNavigation as 'tab'
  it('detects Kotlin BottomNavigation as tab', async () => {
    const runner = createMockRunner({
      '/project/MainScreen.kt': `
@Composable
fun MainScreen() {
  Scaffold(
    bottomBar = {
      BottomNavigation {
        items.forEach { item ->
          BottomNavigationItem(selected = false, onClick = {}, icon = {})
        }
      }
    }
  ) { }
}`,
    })
    const result = await buildNavGraph('/project', 'kotlin-compose', runner)
    const tabNode = result.nodes.find((n) => n.type === 'tab')
    expect(tabNode).toBeDefined()
  })

  // Test 9: relative file paths as screenIds
  it('returns relative file paths as screenIds', async () => {
    const runner = createMockRunner({
      '/project/Sources/Views/HomeView.swift': `
struct HomeView: View {
  var body: some View {
    NavigationLink(destination: DetailView()) { Text("Go") }
  }
}`,
    })
    const result = await buildNavGraph('/project', 'swiftui', runner)
    const node = result.nodes.find((n) => n.type === 'push')
    expect(node).toBeDefined()
    expect(node!.screenId).toBe('Sources/Views/HomeView.swift')
  })
})
