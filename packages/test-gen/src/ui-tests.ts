import type { PlatformSpec, PlatformScreenSpec, PlatformComponentSpec, MaestroFlow } from '@appifex/core'

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase()
}

const TAPPABLE_TYPES = new Set([
  'TouchableOpacity', 'Pressable', 'Button',
  'button', 'TouchableHighlight',
])

const INPUT_TYPES = new Set([
  'TextField', 'TextInput', 'input',
])

const LIST_TYPES = new Set([
  'LazyVGrid', 'FlatList', 'List', 'list',
])

// Types where Maestro can reliably discover .accessibilityIdentifier / testID
// EXCLUDES containers (VStack, HStack, etc.) — their identifiers overwrite children in iOS accessibility tree
const MAESTRO_DISCOVERABLE_TYPES = new Set([
  'Button', 'button', 'TouchableOpacity', 'Pressable', 'TouchableHighlight',
  'TextField', 'TextInput', 'Toggle', 'Slider', 'Stepper', 'DatePicker',
])

/**
 * Collect the IDs of all components that are descendants of a list container.
 * List children represent dynamic/sample data from the design and won't exist
 * at runtime on first launch, so we must skip text assertions for them.
 */
function collectListDescendantIds(comps: PlatformComponentSpec[]): Set<string> {
  const ids = new Set<string>()
  function walk(children: PlatformComponentSpec[], insideList: boolean) {
    for (const c of children) {
      if (insideList) ids.add(c.id)
      const isList = LIST_TYPES.has(c.platformType)
      if (c.children) walk(c.children, insideList || isList)
    }
  }
  walk(comps, false)
  return ids
}

function generateFlowYaml(
  screen: PlatformScreenSpec,
  allScreens: PlatformScreenSpec[],
  bundleId: string,
  designScreenshot?: string,
  screenshotThreshold?: number,
): string {
  const lines: string[] = []
  lines.push(`appId: ${bundleId}`)
  lines.push('---')
  lines.push(`# Test: ${screen.name}`)
  lines.push(`# Verify all elements are visible and interactive`)

  const allComps = flattenComponents(screen.components)
  const listDescendantIds = collectListDescendantIds(screen.components)

  // Assert screen title/name is visible as text
  lines.push(`- assertVisible:`)
  lines.push(`    text: "${screen.name}"`)

  // Assert text content from component props (labels, titles, placeholders)
  // Skip components inside lists — their text is design-time sample data
  const textAsserted = new Set<string>()
  textAsserted.add(screen.name)

  for (const comp of allComps) {
    if (listDescendantIds.has(comp.id)) continue

    const textValues = [
      comp.props?.title,
      comp.props?.label,
      comp.props?.placeholder,
    ].filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 50)

    for (const text of textValues) {
      if (!textAsserted.has(text)) {
        textAsserted.add(text)
        lines.push(`- assertVisible:`)
        lines.push(`    text: "${text.replace(/"/g, '\\"')}"`)
      }
    }
  }

  // Assert accessibility IDs — only for discoverable (leaf/interactive) elements
  // Skip list descendants — their IDs are from design-time sample rows
  const discoverableComps = allComps.filter(c => MAESTRO_DISCOVERABLE_TYPES.has(c.platformType) && c.testId && !listDescendantIds.has(c.id))
  if (discoverableComps.length > 0) {
    lines.push('')
    lines.push('# Verify interactive elements by accessibilityIdentifier')
    for (const comp of discoverableComps) {
      lines.push(`- assertVisible:`)
      lines.push(`    id: "${comp.testId}" # ${comp.platformType}: ${comp.name}`)
    }
  }

  // Input interactions — type text into input fields
  const inputs = allComps.filter(c => INPUT_TYPES.has(c.platformType))
  if (inputs.length > 0) {
    lines.push('')
    lines.push('# Test input fields')
    for (const input of inputs) {
      if (input.testId) {
        const placeholder = input.props?.['placeholder'] as string ?? input.name
        lines.push(`- tapOn:`)
        lines.push(`    id: "${input.testId}"`)
        lines.push(`- inputText: "Test ${placeholder}"`)
        lines.push(`- hideKeyboard`)
      }
    }
  }

  // Button interactions — tap buttons and verify they respond
  // Skip list descendants — sample row buttons won't exist at runtime
  const buttons = allComps.filter(c => TAPPABLE_TYPES.has(c.platformType) && !listDescendantIds.has(c.id))
  if (buttons.length > 0) {
    lines.push('')
    lines.push('# Test button interactions')
    for (const btn of buttons) {
      if (btn.testId) {
        const label = btn.props?.['label'] ?? btn.props?.['title'] ?? btn.name
        lines.push(`- tapOn:`)
        lines.push(`    id: "${btn.testId}" # ${label}`)
      }
    }
  }

  // List assertions — verify lists are present and scrollable
  const lists = allComps.filter(c => LIST_TYPES.has(c.platformType))
  if (lists.length > 0) {
    lines.push('')
    lines.push('# Verify list components')
    for (const list of lists) {
      if (list.testId) {
        lines.push(`- assertVisible:`)
        lines.push(`    id: "${list.testId}" # ${list.name}`)
        lines.push(`- scroll:`)
        lines.push(`    elementId: "${list.testId}"`)
        lines.push(`    direction: DOWN`)
      }
    }
  }

  // Visual comparison against design screenshot
  if (designScreenshot) {
    const threshold = screenshotThreshold ?? 80
    lines.push('')
    lines.push('# Visual comparison: verify layout matches design')
    lines.push(`- assertScreenshot:`)
    lines.push(`    path: ${designScreenshot}`)
    lines.push(`    thresholdPercentage: ${threshold}`)
    lines.push(`    label: "${screen.name} matches design"`)
  }

  return lines.join('\n') + '\n'
}

function flattenComponents(comps: PlatformComponentSpec[]): PlatformComponentSpec[] {
  const result: PlatformComponentSpec[] = []
  for (const c of comps) {
    result.push(c)
    if (c.children) {
      result.push(...flattenComponents(c.children))
    }
  }
  return result
}

export interface UITestOpts {
  /** Bundle ID for Maestro appId. Defaults to com.dtc.App */
  bundleId?: string
  /** Map of screenId → relative path to design screenshot for visual comparison */
  designScreenshots?: Record<string, string>
  /** Similarity threshold for screenshot comparison (0-100). Default: 80 */
  screenshotThreshold?: number
  /**
   * Phase 11 (QUALITY-01b): when provided, only generate flows for screens
   * whose `name` is in the Set. Undefined = full spec (backward-compatible).
   * An empty Set returns zero flows (D-10 skip semantics).
   */
  screenFilter?: Set<string>
}

export function generateUITests(spec: PlatformSpec, opts?: UITestOpts): MaestroFlow[] {
  const bundleId = opts?.bundleId ?? 'com.dtc.App'
  const screenshots = opts?.designScreenshots ?? {}
  const threshold = opts?.screenshotThreshold
  const filter = opts?.screenFilter
  // Narrow WHICH flows are generated; generateFlowYaml still sees the full
  // spec.screens so cross-screen navigation targets still resolve.
  const screens = filter ? spec.screens.filter((s) => filter.has(s.name)) : spec.screens
  return screens.map(screen => ({
    name: screen.name,
    screenId: screen.id,
    fileName: `${toKebabCase(screen.name)}.yaml`,
    content: generateFlowYaml(screen, spec.screens, bundleId, screenshots[screen.id], threshold),
  }))
}
