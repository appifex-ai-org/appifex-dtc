import type { Platform, Runner } from '@appifex/core'
import type { NavNode } from './types.js'
import { relative } from 'node:path'

// ── SwiftUI navigation patterns ──

const SWIFT_TAB_VIEW = /TabView\s*\{/
const SWIFT_TAB_ITEM_TARGET = /(\w+)\s*\(\)\s*\n?\s*\.tabItem/g
const SWIFT_NAV_LINK = /NavigationLink\s*\(.*destination:\s*(\w+)\s*\(\)/g
const SWIFT_SHEET = /\.sheet\s*\([^)]*\)\s*\{[^}]*?(\w+)\s*\(\)/gs
const SWIFT_FULL_COVER = /\.fullScreenCover\s*\([^)]*\)\s*\{[^}]*?(\w+)\s*\(\)/gs
const SWIFT_SPLIT_VIEW = /NavigationSplitView\s*\{/
const SWIFT_MAIN_APP = /@main\s+struct/
const SWIFT_WINDOW_GROUP_ENTRY = /WindowGroup\s*\{[^}]*?(\w+)\s*\(\)/s

// ── Kotlin navigation patterns ──

const KOTLIN_BOTTOM_NAV = /BottomNavigation\s*\{|NavigationBar\s*\{/
const KOTLIN_COMPOSABLE_ROUTE = /composable\s*\(\s*["'](\w+)["']/g
const KOTLIN_DIALOG = /Dialog\s*\(/
const KOTLIN_START_DEST = /startDestination\s*=\s*["']?(\w+)/

export interface NavGraphResult {
  nodes: NavNode[]
  entryPoint: string | null
}

export async function buildNavGraph(
  outputDir: string,
  platform: Platform,
  runner: Runner,
): Promise<NavGraphResult> {
  const ext = platform === 'swiftui' ? '**/*.swift' : '**/*.kt'
  const files = await runner.glob(ext)
  const nodes: NavNode[] = []
  let entryPoint: string | null = null

  if (platform === 'swiftui') {
    for (const filePath of files) {
      const content = await runner.readFile(filePath)
      const screenId = relative(outputDir, filePath)

      // Entry point detection: @main + WindowGroup
      if (SWIFT_MAIN_APP.test(content)) {
        const entryMatch = SWIFT_WINDOW_GROUP_ENTRY.exec(content)
        if (entryMatch) {
          entryPoint = entryMatch[1]
        }
      }

      // TabView
      if (SWIFT_TAB_VIEW.test(content)) {
        const targets: string[] = []
        // Reset regex lastIndex
        SWIFT_TAB_ITEM_TARGET.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = SWIFT_TAB_ITEM_TARGET.exec(content)) !== null) {
          targets.push(match[1])
        }
        nodes.push({ screenId, type: 'tab', targets })
      }

      // NavigationLink
      SWIFT_NAV_LINK.lastIndex = 0
      let navMatch: RegExpExecArray | null
      const pushTargets: string[] = []
      while ((navMatch = SWIFT_NAV_LINK.exec(content)) !== null) {
        pushTargets.push(navMatch[1])
      }
      if (pushTargets.length > 0) {
        nodes.push({ screenId, type: 'push', targets: pushTargets })
      }

      // .sheet()
      SWIFT_SHEET.lastIndex = 0
      let sheetMatch: RegExpExecArray | null
      const modalTargets: string[] = []
      while ((sheetMatch = SWIFT_SHEET.exec(content)) !== null) {
        modalTargets.push(sheetMatch[1])
      }
      // .fullScreenCover()
      SWIFT_FULL_COVER.lastIndex = 0
      let coverMatch: RegExpExecArray | null
      while ((coverMatch = SWIFT_FULL_COVER.exec(content)) !== null) {
        modalTargets.push(coverMatch[1])
      }
      if (modalTargets.length > 0) {
        nodes.push({ screenId, type: 'modal', targets: modalTargets })
      }

      // NavigationSplitView
      if (SWIFT_SPLIT_VIEW.test(content)) {
        nodes.push({ screenId, type: 'drawer', targets: [] })
      }
    }
  } else {
    // Kotlin Compose
    for (const filePath of files) {
      const content = await runner.readFile(filePath)
      const screenId = relative(outputDir, filePath)

      // Entry point: startDestination
      const startMatch = KOTLIN_START_DEST.exec(content)
      if (startMatch) {
        entryPoint = startMatch[1]
      }

      // BottomNavigation / NavigationBar
      if (KOTLIN_BOTTOM_NAV.test(content)) {
        nodes.push({ screenId, type: 'tab', targets: [] })
      }

      // composable() routes
      KOTLIN_COMPOSABLE_ROUTE.lastIndex = 0
      let routeMatch: RegExpExecArray | null
      const routeTargets: string[] = []
      while ((routeMatch = KOTLIN_COMPOSABLE_ROUTE.exec(content)) !== null) {
        routeTargets.push(routeMatch[1])
      }
      if (routeTargets.length > 0) {
        nodes.push({ screenId, type: 'push', targets: routeTargets })
      }

      // Dialog
      if (KOTLIN_DIALOG.test(content)) {
        nodes.push({ screenId, type: 'modal', targets: [] })
      }
    }
  }

  return { nodes, entryPoint }
}
