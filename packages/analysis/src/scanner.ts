import type { Platform, Runner } from '@appifex/core'
import type { FileCategory, InventoryEntry } from './types.js'
import { relative } from 'node:path'

interface ClassificationRule {
  pattern: RegExp
  type: FileCategory
  namePattern: RegExp
}

/** Suffixes that indicate a View struct is a reusable component, not a screen */
const COMPONENT_SUFFIXES = /(?:Row|Cell|Button|Card|Badge|Label|Icon|Item|Header|Footer|Overlay|Shape|Style|Indicator|Tag|Chip|Segment|Toggle|Picker|Slider|Bar|Tab|Banner|Divider|Avatar|Thumbnail|Preview)$/

/** Content patterns that indicate a View struct is a full screen */
const SCREEN_CONTENT_MARKERS = /NavigationStack|NavigationView|NavigationSplitView|\.navigationTitle|\.navigationBarTitle|TabView|\.sheet\(|\.fullScreenCover\(|\.toolbar\s*\{/

const SWIFTUI_RULES: ClassificationRule[] = [
  { pattern: /struct\s+(\w+)\s*:\s*View\b/, type: 'screen', namePattern: /struct\s+(\w+)/ },
  { pattern: /@Observable\s+class\s+(\w+)|class\s+(\w+)\s*:\s*ObservableObject/, type: 'component', namePattern: /class\s+(\w+)/ },
  { pattern: /struct\s+(\w+)\s*:\s*(?:.*(?:Identifiable|Codable))/, type: 'model', namePattern: /struct\s+(\w+)/ },
  { pattern: /class\s+(\w+Service)\b|struct\s+(\w+Service)\b/, type: 'service', namePattern: /(?:class|struct)\s+(\w+)/ },
]

const KOTLIN_RULES: ClassificationRule[] = [
  { pattern: /@Composable\s+fun\s+(\w+Screen)\s*\(/, type: 'screen', namePattern: /fun\s+(\w+)/ },
  { pattern: /class\s+(\w+ViewModel)/, type: 'component', namePattern: /class\s+(\w+)/ },
  { pattern: /^data\s+class\s+(\w+)/m, type: 'model', namePattern: /class\s+(\w+)/ },
  { pattern: /class\s+(\w+(?:Repository|Service))\b/, type: 'service', namePattern: /class\s+(\w+)/ },
]

function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

export async function scanProject(
  outputDir: string,
  platform: Platform,
  runner: Runner,
): Promise<InventoryEntry[]> {
  const ext = platform === 'swiftui' ? '**/*.swift' : '**/*.kt'
  const files = await runner.glob(ext)
  const rules = platform === 'swiftui' ? SWIFTUI_RULES : KOTLIN_RULES

  const entries: InventoryEntry[] = []

  for (const filePath of files) {
    const raw = await runner.readFile(filePath)
    const content = stripComments(raw)

    for (const rule of rules) {
      const match = rule.pattern.exec(content)
      if (match) {
        const nameMatch = rule.namePattern.exec(content)
        const name = nameMatch ? (nameMatch[1] ?? nameMatch[2] ?? 'Unknown') : 'Unknown'
        let type = rule.type

        // Refine SwiftUI View classification: demote to 'component' if it looks like a subview
        if (type === 'screen' && platform === 'swiftui') {
          const hasScreenMarkers = SCREEN_CONTENT_MARKERS.test(content)
          const hasComponentName = COMPONENT_SUFFIXES.test(name)
          if (!hasScreenMarkers && hasComponentName) {
            type = 'component'
          }
        }

        entries.push({
          filePath: relative(outputDir, filePath),
          type,
          name,
        })
        break // first match wins
      }
    }
  }

  return entries
}
