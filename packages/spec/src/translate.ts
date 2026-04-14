import type {
  DesignSpec, Platform, PlatformSpec, PlatformScreenSpec,
  PlatformComponentSpec, ComponentSpec, ScreenSpec,
} from '@appifex/core'
import { toSfSymbol } from './icon-mapping.js'

const SWIFT_TYPE_MAP: Record<string, string> = {
  view: 'VStack',
  text: 'Text',
  image: 'AsyncImage',
  button: 'Button',
  input: 'TextField',
  list: 'LazyVGrid',
  card: 'VStack',
  icon: 'Image',
  'tab-bar': 'TabView',
  'navigation-bar': 'NavigationStack',
  'scroll-view': 'ScrollView',
  modal: 'Sheet',
  custom: 'EmptyView',
}

const KOTLIN_TYPE_MAP: Record<string, string> = {
  view: 'Column',
  text: 'Text',
  image: 'AsyncImage',
  button: 'Button',
  input: 'OutlinedTextField',
  list: 'LazyColumn',
  card: 'Card',
  icon: 'Icon',
  'tab-bar': 'NavigationBar',
  'navigation-bar': 'NavHost',
  'scroll-view': 'LazyColumn',
  modal: 'ModalBottomSheet',
  custom: 'Box',
}

function toCamelCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase())
}

function toPascalCase(name: string): string {
  const camel = toCamelCase(name)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function translateComponent(
  comp: ComponentSpec,
  platform: Platform,
  testIds: Record<string, string>,
): PlatformComponentSpec {
  const typeMap = platform === 'kotlin-compose' ? KOTLIN_TYPE_MAP
    : SWIFT_TYPE_MAP
  const testId = platform === 'kotlin-compose'
    ? comp.name.replace(/\s+/g, '_').toLowerCase()
    : comp.name

  testIds[comp.id] = testId

  const compProps = comp.props ?? {}
  const props: Record<string, unknown> = { ...compProps }
  if (platform !== 'kotlin-compose') {
    props.testID = testId
  }

  // Map icon identity to SF Symbol for SwiftUI
  if (platform === 'swiftui' && compProps.iconFontFamily && compProps.iconFontName) {
    props.sfSymbolName = toSfSymbol(
      compProps.iconFontFamily as string,
      compProps.iconFontName as string,
    )
  }

  // Map image fill mode to AppImage style for SwiftUI
  if (platform === 'swiftui' && (compProps.imageUrl || compProps.imageFillMode)) {
    const mode = compProps.imageFillMode as string | undefined
    const w = typeof comp.style?.width === 'number' ? comp.style.width as number : undefined
    const h = typeof comp.style?.height === 'number' ? comp.style.height as number : undefined
    props.appImageStyle = inferAppImageStyle(mode, w, h)
  }

  // Generate SwiftUI modifier hints
  if (platform === 'swiftui' && comp.style) {
    const modifiers = generateSwiftModifiers(comp.style as Record<string, unknown>)
    if (modifiers.length > 0) {
      props.swiftModifiers = modifiers
    }
  }

  // Generate Kotlin Compose modifier hints (always includes testTag)
  if (platform === 'kotlin-compose') {
    const modifiers = generateComposeModifiers(comp.style as Record<string, unknown>)
    modifiers.push(`.testTag("${testId}")`)
    props.composeModifiers = modifiers
  }

  return {
    id: comp.id,
    platformType: typeMap[comp.type] ?? typeMap.custom,
    name: comp.name,
    props,
    children: comp.children?.map(c => translateComponent(c, platform, testIds)),
    style: comp.style as Record<string, unknown>,
    testId,
  }
}

function translateScreen(screen: ScreenSpec, platform: Platform): PlatformScreenSpec {
  const suffix = platform === 'swiftui' ? 'View' : 'Screen'
  const testIds: Record<string, string> = {}

  const components = screen.components.map(c =>
    translateComponent(c, platform, testIds),
  )

  return {
    id: screen.id,
    name: screen.name,
    componentName: toPascalCase(screen.name) + suffix,
    description: screen.description,
    components,
    testIds,
  }
}

export function generateSwiftModifiers(style: Record<string, unknown>): string[] {
  const mods: string[] = []

  // Padding
  const pad = style.padding as { top?: number; right?: number; bottom?: number; left?: number } | undefined
  if (pad) {
    if (pad.top === pad.bottom && pad.left === pad.right && pad.top === pad.left) {
      mods.push(`.padding(${pad.top})`)
    } else if (pad.top === pad.bottom && pad.left === pad.right) {
      mods.push(`.padding(.vertical, ${pad.top})`)
      mods.push(`.padding(.horizontal, ${pad.left})`)
    } else {
      if (pad.top) mods.push(`.padding(.top, ${pad.top})`)
      if (pad.bottom) mods.push(`.padding(.bottom, ${pad.bottom})`)
      if (pad.left) mods.push(`.padding(.leading, ${pad.left})`)
      if (pad.right) mods.push(`.padding(.trailing, ${pad.right})`)
    }
  }

  // Frame sizing
  if (style.width === 'fill_container') mods.push('.frame(maxWidth: .infinity)')
  else if (typeof style.width === 'number') mods.push(`.frame(width: ${style.width})`)
  if (style.height === 'fill_container') mods.push('.frame(maxHeight: .infinity)')
  else if (typeof style.height === 'number') mods.push(`.frame(height: ${style.height})`)

  // Background
  if (style.backgroundColor) mods.push(`.background(Color("${style.backgroundColor}"))`)

  // Corner radius
  if (style.borderRadius) mods.push(`.clipShape(.rect(cornerRadius: ${style.borderRadius}))`)

  // Border
  if (style.borderWidth && style.borderColor) {
    mods.push(`.overlay(RoundedRectangle(cornerRadius: ${style.borderRadius ?? 0}, style: .continuous).stroke(Color("${style.borderColor}"), lineWidth: ${style.borderWidth}))`)
  }

  // Shadow
  const shadow = style.shadow as { color: string; offsetX: number; offsetY: number; blur: number } | undefined
  if (shadow) {
    mods.push(`.shadow(color: Color("${shadow.color}").opacity(0.2), radius: ${shadow.blur}, x: ${shadow.offsetX}, y: ${shadow.offsetY})`)
  }

  // Opacity
  if (style.opacity != null && (style.opacity as number) < 1) {
    mods.push(`.opacity(${style.opacity})`)
  }

  return mods
}

export function generateComposeModifiers(style: Record<string, unknown>): string[] {
  const mods: string[] = []

  // Padding
  const pad = style.padding as { top?: number; right?: number; bottom?: number; left?: number } | undefined
  if (pad) {
    if (pad.top === pad.bottom && pad.left === pad.right && pad.top === pad.left) {
      mods.push(`.padding(${pad.top}.dp)`)
    } else {
      const parts: string[] = []
      if (pad.top) parts.push(`top = ${pad.top}.dp`)
      if (pad.bottom) parts.push(`bottom = ${pad.bottom}.dp`)
      if (pad.left) parts.push(`start = ${pad.left}.dp`)
      if (pad.right) parts.push(`end = ${pad.right}.dp`)
      if (parts.length > 0) mods.push(`.padding(${parts.join(', ')})`)
    }
  }

  // Frame sizing
  if (style.width === 'fill_container') mods.push('.fillMaxWidth()')
  else if (typeof style.width === 'number') mods.push(`.width(${style.width}.dp)`)
  if (style.height === 'fill_container') mods.push('.fillMaxHeight()')
  else if (typeof style.height === 'number') mods.push(`.height(${style.height}.dp)`)

  // Background
  if (style.backgroundColor) mods.push(`.background(Color(0xFF${(style.backgroundColor as string).replace('#', '')}))`)

  // Corner radius
  if (style.borderRadius) mods.push(`.clip(RoundedCornerShape(${style.borderRadius}.dp))`)

  // Border
  if (style.borderWidth && style.borderColor) {
    mods.push(`.border(${style.borderWidth}.dp, Color(0xFF${(style.borderColor as string).replace('#', '')}), RoundedCornerShape(${style.borderRadius ?? 0}.dp))`)
  }

  // Shadow
  const shadow = style.shadow as { color: string; offsetX: number; offsetY: number; blur: number } | undefined
  if (shadow) {
    mods.push(`.shadow(elevation = ${shadow.blur}.dp, shape = RoundedCornerShape(${style.borderRadius ?? 0}.dp))`)
  }

  // Opacity
  if (style.opacity != null && (style.opacity as number) < 1) {
    mods.push(`.alpha(${style.opacity}f)`)
  }

  return mods
}

export function inferAppImageStyle(mode?: string, width?: number, height?: number): string {
  if (!mode && !width && !height) return 'card'
  if (mode === 'fill') {
    if (width && height) {
      const ratio = width / height
      if (ratio > 1.5) return 'hero'
      if (ratio > 1.2) return 'card'
      if (Math.abs(ratio - 1) < 0.1) return 'grid'
    }
    return 'card'
  }
  if (mode === 'fit') return 'detail'
  if (mode === 'stretch') return 'fullWidth'
  return 'card'
}

export function translateSpec(spec: DesignSpec, platform: Platform): PlatformSpec {
  const imports = platform === 'kotlin-compose'
    ? ['androidx.compose.material3', 'androidx.compose.foundation', 'androidx.compose.ui', 'androidx.navigation.compose']
    : ['SwiftUI']

  return {
    platform,
    screens: spec.screens.map(s => translateScreen(s, platform)),
    designTokens: spec.designTokens,
    imports,
  }
}
