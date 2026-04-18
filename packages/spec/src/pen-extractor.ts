import type {
  DesignSpec,
  ScreenSpec,
  ComponentSpec,
  DesignTokens,
  NavigationSpec,
  ComponentType,
} from '@appifex/core'
import { sanitizeLayerName } from '@appifex/design'
import { extractNavigation, describeScreen } from './pen-navigation.js'

/**
 * Extract a DesignSpec directly from a .pen file's JSON structure.
 * This is deterministic — no LLM needed — and captures exact colors,
 * component hierarchy, text content, and navigation from the design.
 */
export function extractSpecFromPen(penJson: string): DesignSpec {
  return extractSpecFromPenObject(JSON.parse(penJson) as PenDocument)
}

export function extractSpecFromPenObject(pen: PenDocument): DesignSpec {
  if (!pen.children || pen.children.length === 0) {
    throw new Error('Pen file has no screen frames')
  }

  // Resolve color variables
  const vars = pen.variables ?? {}
  const resolveColor = (val: unknown): string => {
    if (val == null) return '#000000'
    if (typeof val !== 'string') return '#000000'
    if (val.startsWith('$')) {
      const varName = val.slice(1)
      const resolved = vars[varName]?.value
      if (typeof resolved === 'string') return resolved
      return '#000000'
    }
    return val
  }

  // Phase 7 (DESIGN-01): use shared sanitizeLayerName for screen-level dedup scope
  const takenScreens = new Set<string>()

  // Extract screens from top-level frames only
  const frames = pen.children.filter((child) => child.type === 'frame')
  const screens: ScreenSpec[] = frames.map((frame) => extractScreen(frame, resolveColor, takenScreens))

  // Extract design tokens from variables
  const designTokens = extractDesignTokens(vars)

  // Extract navigation from tab bar if present (only search within frames)
  const navigation = extractNavigation(frames, screens, resolveColor)

  return {
    version: '1.0',
    screens,
    designTokens,
    navigation,
  }
}

function extractScreen(
  frame: PenNode,
  resolveColor: (val: unknown) => string,
  takenScreens: Set<string>,
): ScreenSpec {
  // Phase 7 (DESIGN-01): use shared sanitizeLayerName — see packages/design/src/sanitize.ts
  const screenName = sanitizeLayerName(frame.name ?? 'unnamed', takenScreens)
  const id = `screen-${screenName}`
  const seenIds = new Set<string>() // fresh per screen — component scope

  const direction = frame.layout === 'horizontal' ? 'horizontal' : 'vertical'
  const layoutType = frame.layout === 'none' ? ('absolute' as const) : ('stack' as const)

  return {
    id,
    name: frame.name ?? 'Unnamed Screen',
    description: describeScreen(frame),
    components: extractComponents(frame.children ?? [], resolveColor, seenIds),
    layout: {
      type: layoutType,
      direction,
      spacing: frame.gap ?? 16,
    },
  }
}

function extractComponents(
  nodes: PenNode[],
  resolveColor: (val: unknown) => string,
  seenIds: Set<string>,
): ComponentSpec[] {
  const components: ComponentSpec[] = []

  for (const node of nodes) {
    // Skip status bars — they're system UI
    if (node.name?.toLowerCase().includes('status bar')) continue

    const comp = nodeToComponent(node, resolveColor, seenIds)
    if (comp) components.push(comp)
  }

  return components
}

function nodeToComponent(
  node: PenNode,
  resolveColor: (val: unknown) => string,
  seenIds: Set<string>,
): ComponentSpec | null {
  const name = node.name ?? 'unnamed'
  // Phase 7 (DESIGN-01): use shared sanitizeLayerName — see packages/design/src/sanitize.ts
  const id = `comp-${sanitizeLayerName(name, seenIds)}`
  const type = mapPenType(node)

  // Extract style
  const style: Record<string, unknown> = {}
  if (node.cornerRadius)
    style.borderRadius = Array.isArray(node.cornerRadius) ? node.cornerRadius[0] : node.cornerRadius
  if (node.width) style.width = node.width
  if (node.height) style.height = node.height

  // Resolve fill colors
  const fill = resolveFill(node, resolveColor)
  if (fill) style.backgroundColor = fill

  // Layout
  if (node.layout && node.layout !== 'none') {
    style.flexDirection = node.layout === 'horizontal' ? 'row' : 'column'
  }
  if (node.gap != null) style.gap = node.gap
  if (node.justifyContent) style.justifyContent = node.justifyContent
  if (node.alignItems) style.alignItems = node.alignItems
  if (node.opacity != null && node.opacity < 1) style.opacity = node.opacity

  // Padding
  if (node.padding != null) {
    style.padding = normalizePadding(node.padding)
  }

  // Shadow (first drop shadow effect)
  const shadow = node.effects?.find((e) => e.type === 'drop_shadow' || e.type === 'shadow')
  if (shadow) {
    style.shadow = {
      color: resolveColor(shadow.color),
      offsetX: shadow.offsetX ?? 0,
      offsetY: shadow.offsetY ?? 4,
      blur: shadow.blur ?? 8,
      spread: shadow.spread,
    }
  }

  // Stroke → border
  if (node.stroke?.width && node.stroke.width > 0) {
    style.borderWidth = node.stroke.width
    if (node.stroke.color) style.borderColor = resolveColor(node.stroke.color)
  }

  // Extract text content and typography
  const props: Record<string, unknown> = {}
  if (node.content) props.label = node.content
  if (node.type === 'text' && node.content) {
    props.text = node.content
    if (node.fontSize) style.fontSize = node.fontSize
    if (node.fontWeight) style.fontWeight = node.fontWeight
    if (node.fontFamily) style.fontFamily = node.fontFamily
    if (node.letterSpacing) style.letterSpacing = node.letterSpacing
    if (node.lineHeight) style.lineHeight = node.lineHeight
    if (node.textAlign) style.textAlign = node.textAlign as 'left' | 'center' | 'right'
    const textColor = resolveFill(node, resolveColor)
    if (textColor) style.color = textColor
  }

  // Icon identity
  if (node.iconFontFamily || node.iconFontName) {
    props.iconFontFamily = node.iconFontFamily
    props.iconFontName = node.iconFontName
  }

  // Image fill data
  const imageFill = node.fills?.find((f) => f.type === 'image')
  if (imageFill) {
    if (imageFill.url) props.imageUrl = imageFill.url
    if (imageFill.mode) props.imageFillMode = imageFill.mode
  }

  // Recurse children
  const children = (node.children ?? [])
    .map((child) => nodeToComponent(child, resolveColor, seenIds))
    .filter((c): c is ComponentSpec => c !== null)

  return { id, type, name, props, children: children.length > 0 ? children : undefined, style }
}

function mapPenType(node: PenNode): ComponentType {
  const name = (node.name ?? '').toLowerCase()
  const type = node.type

  // Map by pen type
  if (type === 'text') return 'text'
  if (type === 'image') return 'image'
  if (type === 'icon_font') return 'icon'

  // Map by name patterns
  if (name.includes('button') || name.includes('btn')) return 'button'
  if (name.includes('input') || name.includes('field') || name.includes('textfield')) return 'input'
  if (name.includes('tab bar') || name.includes('tabbar')) return 'tab-bar'
  if (name.includes('nav bar') || name.includes('navbar') || name.includes('header'))
    return 'navigation-bar'
  if (name.includes('list') || name.includes('scroll')) return 'scroll-view'
  if (name.includes('card')) return 'card'
  if (name.includes('modal') || name.includes('sheet')) return 'modal'
  if (name.includes('toggle') || name.includes('switch')) return 'button'

  return 'view'
}

function normalizePadding(padding: number | number[]): {
  top: number
  right: number
  bottom: number
  left: number
} {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding }
  }
  if (padding.length === 2) {
    return { top: padding[0], right: padding[1], bottom: padding[0], left: padding[1] }
  }
  return {
    top: padding[0] ?? 0,
    right: padding[1] ?? 0,
    bottom: padding[2] ?? 0,
    left: padding[3] ?? 0,
  }
}

function resolveFill(node: PenNode, resolveColor: (val: unknown) => string): string | undefined {
  // Check fills array first
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]
    if (fill.type === 'image') return undefined
    if (typeof fill.color === 'string') return resolveColor(fill.color)
    if (fill.color != null && typeof fill.color === 'object') return undefined
  }
  // Then check fill property
  const nodeFill = (node as { fill?: unknown }).fill
  if (typeof nodeFill === 'string') return resolveColor(nodeFill)
  if (nodeFill != null && typeof nodeFill === 'object') return undefined
  return undefined
}

function extractDesignTokens(vars: Record<string, PenVariable>): DesignTokens {
  const colors: Record<string, string> = {}
  const spacing: Record<string, number> = {}
  const borderRadius: Record<string, number> = {}
  // Phase 7 (DESIGN-01): use shared sanitizeLayerName for token key scopes
  const takenColors = new Set<string>()
  const takenSpacing = new Set<string>()
  const takenRadius = new Set<string>()

  for (const [name, v] of Object.entries(vars)) {
    if (v.type === 'color' && v.value) {
      const key = sanitizeLayerName(name, takenColors)
      colors[key] = v.value as string
    } else if (v.type === 'number' && v.value != null) {
      if (name.includes('spacing') || name.includes('gap') || name.includes('padding')) {
        const key = sanitizeLayerName(name, takenSpacing)
        spacing[key] = v.value as number
      } else if (name.includes('radius') || name.includes('corner')) {
        const key = sanitizeLayerName(name, takenRadius)
        borderRadius[key] = v.value as number
      }
    }
  }

  return {
    colors,
    typography: {
      heading: { fontFamily: 'System', fontSize: 24, fontWeight: 'bold' },
      body: { fontFamily: 'System', fontSize: 16, fontWeight: '400' },
      caption: { fontFamily: 'System', fontSize: 12, fontWeight: '400' },
    },
    spacing: Object.keys(spacing).length > 0 ? spacing : { sm: 8, md: 16, lg: 24 },
    borderRadius: Object.keys(borderRadius).length > 0 ? borderRadius : { sm: 8, md: 12, lg: 16 },
  }
}

// ── Pen file types ──

interface PenDocument {
  version: string
  children: PenNode[]
  variables?: Record<string, PenVariable>
}

export interface PenNode {
  type: string
  id?: string
  name?: string
  content?: string
  width?: number | string // can be "fill_container" or "fit_content"
  height?: number | string
  fill?: string
  fills?: Array<{ color?: string; type?: string; url?: string; mode?: string; opacity?: number }>
  cornerRadius?: number | number[] // uniform or per-corner [tl, tr, br, bl]
  fontSize?: number
  fontWeight?: string
  fontFamily?: string
  letterSpacing?: number
  lineHeight?: number
  textAlign?: string
  opacity?: number
  // Layout (flexbox)
  layout?: 'none' | 'vertical' | 'horizontal'
  gap?: number
  padding?: number | number[] // single, [v,h], or [t,r,b,l]
  justifyContent?: 'start' | 'center' | 'end' | 'space_between' | 'space_around'
  alignItems?: 'start' | 'center' | 'end'
  layoutPosition?: 'auto' | 'absolute'
  // Icon font
  iconFontFamily?: string
  iconFontName?: string
  // Effects
  effects?: Array<{
    type: string
    color?: string
    offsetX?: number
    offsetY?: number
    blur?: number
    spread?: number
    inner?: boolean
  }>
  stroke?: { color?: string; width?: number; alignment?: string }
  children?: PenNode[]
}

interface PenVariable {
  type: string
  value?: string | number
}
