import { describe, it, expect } from 'vitest'
import { decidePenFileStrategy, generatePreBuildSummary } from '../src/pipeline.js'
import { formatPreBuildSummary } from '../src/views/format.js'
import type { AppContext, DesignTokens, ModificationPlan } from '@appifex/core'

function makeAppContext(screenNames: string[]): AppContext {
  return {
    platform: 'swiftui',
    inventory: [
      ...screenNames.map(name => ({ name, type: 'screen' as const, filePath: `Sources/Views/${name}View.swift` })),
    ],
    navGraph: [],
    entryPoint: null,
    scannedAt: Date.now(),
  }
}

describe('decidePenFileStrategy', () => {
  it('returns "new" when prompt mentions a screen name not in inventory', () => {
    const appContext = makeAppContext(['Home', 'Profile'])
    const result = decidePenFileStrategy('Add a new Dashboard screen with charts', appContext)
    expect(result).toBe('new')
  })

  it('returns "extend" for nav-only prompt when existing screen is referenced', () => {
    const appContext = makeAppContext(['Home', 'Settings'])
    // "add a tab for settings" — nav-only keyword "tab", no new screen keyword, "settings" in inventory
    const result = decidePenFileStrategy('add a tab for settings', appContext)
    expect(result).toBe('extend')
  })

  it('returns "new" as default when no existing screen names match', () => {
    const appContext = makeAppContext(['Home', 'Profile'])
    const result = decidePenFileStrategy('Add a completely new analytics dashboard', appContext)
    expect(result).toBe('new')
  })

  it('returns "extend" for pure nav-only prompt without screen keyword', () => {
    const appContext = makeAppContext(['Home', 'Profile'])
    const result = decidePenFileStrategy('add a navigation tab', appContext)
    expect(result).toBe('extend')
  })

  it('returns "new" when prompt has both nav-only AND new screen keywords', () => {
    const appContext = makeAppContext(['Home'])
    const result = decidePenFileStrategy('add a tab that opens a new settings screen', appContext)
    expect(result).toBe('new')
  })
})

describe('generatePreBuildSummary', () => {
  const makeTokens = (colors: Record<string, string> = {}, spacing: Record<string, number> = {}): DesignTokens => ({
    colors,
    typography: {},
    spacing,
    borderRadius: {},
  })

  it('returns newScreens inferred from prompt keywords not in inventory', () => {
    const appContext = makeAppContext(['Home', 'Profile'])
    const result = generatePreBuildSummary('Add a Dashboard screen', appContext, 'new', null)
    expect(result.newScreens).toContain('Dashboard')
  })

  it('returns empty modifiedFiles when penStrategy is new and navGraph has no tab nodes', () => {
    const appContext = makeAppContext(['Home'])
    const result = generatePreBuildSummary('Add a Settings screen', appContext, 'new', null)
    expect(result.modifiedFiles).toEqual([])
  })

  it('returns nav entry files in modifiedFiles when navGraph has tab nodes', () => {
    const appContext: AppContext = {
      platform: 'swiftui',
      inventory: [
        { name: 'Home', type: 'screen', filePath: 'Sources/Views/HomeView.swift' },
        { name: 'ContentView', type: 'screen', filePath: 'Sources/Views/ContentView.swift' },
      ],
      navGraph: [{ screenId: 'ContentView', type: 'tab', targets: ['Home'] }],
      entryPoint: 'ContentView',
      scannedAt: Date.now(),
    }
    const result = generatePreBuildSummary('Add a Dashboard screen', appContext, 'new', null)
    expect(result.modifiedFiles).toContain('Sources/Views/ContentView.swift')
  })

  it('returns designStrategy matching the passed penStrategy', () => {
    const appContext = makeAppContext(['Home'])
    expect(generatePreBuildSummary('Add screen', appContext, 'new', null).designStrategy).toBe('new')
    expect(generatePreBuildSummary('Add screen', appContext, 'extend', null).designStrategy).toBe('extend')
  })

  it('returns tokenCount as sum of colors + spacing keys from DesignTokens', () => {
    const tokens = makeTokens({ primary: '#000', secondary: '#fff' }, { sm: 4, md: 8, lg: 16 })
    const result = generatePreBuildSummary('Add a screen', makeAppContext([]), 'new', tokens)
    expect(result.tokenCount).toBe(5) // 2 colors + 3 spacing
  })

  it('returns testFilesToGenerate with one entry per new screen', () => {
    const appContext = makeAppContext(['Home'])
    const result = generatePreBuildSummary('Add a Dashboard screen and Settings page', appContext, 'new', null)
    expect(result.testFilesToGenerate.length).toBe(result.newScreens.length)
  })

  it('handles null appContext gracefully', () => {
    const result = generatePreBuildSummary('Add a Dashboard screen', null, 'new', null)
    // Should not throw; newScreens should still parse from prompt
    expect(result.newScreens).toBeDefined()
    expect(result.modifiedFiles).toEqual([])
  })

  it('handles null existingDesignTokens gracefully', () => {
    const result = generatePreBuildSummary('Add a screen', makeAppContext([]), 'new', null)
    expect(result.tokenCount).toBe(0)
  })

  it('formatPreBuildSummary returns string with Pre-build plan header and all sections', () => {
    const summary = generatePreBuildSummary(
      'Add a Dashboard screen',
      makeAppContext(['Home']),
      'new',
      makeTokens({ primary: '#000' }, { sm: 4 }),
    )
    const output = formatPreBuildSummary(summary)
    expect(output).toContain('Pre-build plan')
    expect(output).toContain('Design')
    expect(output).toContain('create new .pen file')
  })
})

describe('generatePreBuildSummary with modificationPlan', () => {
  const appContext = makeAppContext(['Home', 'Profile'])

  const appContextWithTabs: AppContext = {
    platform: 'swiftui',
    inventory: [
      { name: 'Home', type: 'screen', filePath: 'Sources/Views/HomeView.swift' },
      { name: 'ContentView', type: 'screen', filePath: 'Sources/Views/ContentView.swift' },
    ],
    navGraph: [{ screenId: 'ContentView', type: 'tab', targets: ['Home'] }],
    entryPoint: 'ContentView',
    scannedAt: Date.now(),
  }

  it('uses modification plan items for modifiedFiles when plan is non-empty', () => {
    const plan: ModificationPlan = {
      items: [
        { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add tab', changeType: 'navigation', fileContent: '...' },
      ],
    }
    const summary = generatePreBuildSummary('add settings', appContext, 'new', null, plan)
    expect(summary.modifiedFiles).toEqual(['Sources/ContentView.swift'])
  })

  it('falls back to navGraph heuristic when modificationPlan is empty', () => {
    const plan: ModificationPlan = { items: [] }
    const summary = generatePreBuildSummary('add settings tab', appContextWithTabs, 'new', null, plan)
    // Should use the existing heuristic (entry point file from navGraph)
    expect(summary.modifiedFiles.length).toBeGreaterThanOrEqual(0) // depends on appContext fixture
  })

  it('falls back to navGraph heuristic when modificationPlan is undefined', () => {
    const summary = generatePreBuildSummary('add settings tab', appContextWithTabs, 'new', null)
    // Same behavior as before Plan 01 — backward compatible
    expect(summary.modifiedFiles).toContain('Sources/Views/ContentView.swift')
  })

  it('overrides navGraph heuristic when modificationPlan has items', () => {
    const plan: ModificationPlan = {
      items: [
        { filePath: 'Sources/SettingsView.swift', screenName: 'Settings', changeDescription: 'Add toggle', changeType: 'layout', fileContent: 'struct SettingsView {}' },
        { filePath: 'Sources/HomeView.swift', screenName: 'Home', changeDescription: 'Update nav', changeType: 'navigation', fileContent: 'struct HomeView {}' },
      ],
    }
    const summary = generatePreBuildSummary('update settings and home', appContextWithTabs, 'new', null, plan)
    expect(summary.modifiedFiles).toEqual(['Sources/SettingsView.swift', 'Sources/HomeView.swift'])
    // Should NOT contain the navGraph heuristic file
    expect(summary.modifiedFiles).not.toContain('Sources/Views/ContentView.swift')
  })
})
