import type { ScreenSpec, NavigationSpec } from '@appifex/core'
import type { PenNode } from './pen-extractor.js'

function toKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
}

export function extractNavigation(
  frames: PenNode[],
  screens: ScreenSpec[],
  resolveColor: (val: unknown) => string,
): NavigationSpec | undefined {
  // Build a lookup from screen name keywords to screen IDs
  const screenIdLookup = new Map<string, string>()
  for (const screen of screens) {
    screenIdLookup.set(screen.id, screen.id)
    // Also index by lowercase keywords for fuzzy matching
    for (const word of screen.name.toLowerCase().split(/\s+/)) {
      if (word.length > 2) screenIdLookup.set(word, screen.id)
    }
  }

  // Look for a tab bar in any screen frame
  for (const frame of frames) {
    const tabBar = findNode(frame, (n) => {
      const name = (n.name ?? '').toLowerCase()
      return name.includes('tab bar') || name.includes('tabbar')
    })
    if (tabBar && tabBar.children && tabBar.children.length > 0) {
      const routes = tabBar.children.map((tab) => {
        const labelNode = findNode(tab, (n) => n.type === 'text')
        const label = labelNode?.content ?? tab.name ?? 'Tab'
        // Try to match tab label to an existing screen ID
        const matchedId = screenIdLookup.get(label.toLowerCase()) ?? `screen-${toKebab(label)}`
        return {
          screenId: matchedId,
          path: `/${toKebab(label)}`,
        }
      })
      return { type: 'tab' as const, routes }
    }
  }

  // No tab bar found — assume stack navigation
  if (frames.length > 1) {
    return {
      type: 'stack' as const,
      routes: screens.map((s) => ({
        screenId: s.id,
        path: `/${toKebab(s.name)}`,
      })),
    }
  }

  return undefined
}

export function describeScreen(frame: PenNode): string {
  const parts: string[] = []
  const name = frame.name ?? ''

  // Count component types
  const allNodes = flattenNodes(frame)
  const texts = allNodes.filter((n) => n.type === 'text')
  const buttons = allNodes.filter(
    (n) =>
      (n.name ?? '').toLowerCase().includes('btn') ||
      (n.name ?? '').toLowerCase().includes('button'),
  )
  const inputs = allNodes.filter(
    (n) =>
      (n.name ?? '').toLowerCase().includes('field') ||
      (n.name ?? '').toLowerCase().includes('input'),
  )
  const lists = allNodes.filter((n) => (n.name ?? '').toLowerCase().includes('list'))

  parts.push(`Screen "${name}"`)
  if (buttons.length > 0) parts.push(`${buttons.length} button(s)`)
  if (inputs.length > 0) parts.push(`${inputs.length} input field(s)`)
  if (lists.length > 0) parts.push(`list/scrollable content`)

  // Include key text content
  const keyTexts = texts
    .filter((t) => t.content && t.content.length > 2 && !t.content.match(/^\d+:\d+$/)) // skip time strings
    .slice(0, 3)
    .map((t) => `"${t.content}"`)
  if (keyTexts.length > 0) parts.push(`contains: ${keyTexts.join(', ')}`)

  return parts.join(' — ')
}

export function findNode(node: PenNode, predicate: (n: PenNode) => boolean): PenNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children ?? []) {
    const found = findNode(child, predicate)
    if (found) return found
  }
  return undefined
}

export function flattenNodes(node: PenNode): PenNode[] {
  const result: PenNode[] = [node]
  for (const child of node.children ?? []) {
    result.push(...flattenNodes(child))
  }
  return result
}
