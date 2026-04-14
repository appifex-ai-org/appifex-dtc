// ── Platforms ──
export type Platform = 'swiftui' | 'kotlin-compose' | 'react'

// ── Design Spec ──
export interface DesignSpec {
  version: string
  screens: ScreenSpec[]
  designTokens: DesignTokens
  navigation?: NavigationSpec
}

export interface ScreenSpec {
  id: string
  name: string
  description: string
  components: ComponentSpec[]
  layout: LayoutSpec
}

export interface ComponentSpec {
  id: string
  type: ComponentType
  name: string
  props: Record<string, unknown>
  children?: ComponentSpec[]
  style: StyleSpec
  testId?: string
  accessibilityLabel?: string
}

export type ComponentType =
  | 'view' | 'text' | 'image' | 'button' | 'input'
  | 'list' | 'card' | 'icon' | 'tab-bar' | 'navigation-bar'
  | 'scroll-view' | 'modal' | 'custom'

export interface StyleSpec {
  width?: string | number
  height?: string | number
  padding?: SpacingSpec
  margin?: SpacingSpec
  backgroundColor?: string
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  fontSize?: number
  fontWeight?: string
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  flexDirection?: 'row' | 'column'
  justifyContent?: string
  alignItems?: string
  gap?: number
  opacity?: number
  shadow?: ShadowSpec
  [key: string]: unknown
}

export interface SpacingSpec {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface ShadowSpec {
  color: string
  offsetX: number
  offsetY: number
  blur: number
  spread?: number
}

export interface LayoutSpec {
  type: 'stack' | 'grid' | 'scroll' | 'tabs' | 'absolute'
  direction?: 'horizontal' | 'vertical'
  columns?: number
  spacing?: number
}

export interface DesignTokens {
  colors: Record<string, string>
  typography: Record<string, TypographyToken>
  spacing: Record<string, number>
  borderRadius: Record<string, number>
}

export interface TypographyToken {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight?: number
  letterSpacing?: number
}

// ── Design Delta (Phase 12) ──

export type DesignTokenCategory = 'colors' | 'typography' | 'spacing' | 'borderRadius'

export interface DesignDeltaEntry {
  category: DesignTokenCategory
  name: string
  value: string | number | TypographyToken
}

export interface DesignDeltaChangedEntry {
  category: DesignTokenCategory
  name: string
  oldValue: string | number | TypographyToken
  newValue: string | number | TypographyToken
}

export interface DesignDeltaReport {
  added: DesignDeltaEntry[]
  removed: DesignDeltaEntry[]
  changed: DesignDeltaChangedEntry[]
}

export interface NavigationSpec {
  type: 'stack' | 'tab' | 'drawer' | 'mixed'
  routes: RouteSpec[]
}

export interface RouteSpec {
  screenId: string
  path: string
  children?: RouteSpec[]
}

// ── Platform Spec (translated) ──
export interface PlatformSpec {
  platform: Platform
  screens: PlatformScreenSpec[]
  designTokens: DesignTokens
  imports: string[]
}

export interface PlatformScreenSpec {
  id: string
  name: string
  componentName: string
  description: string
  components: PlatformComponentSpec[]
  testIds: Record<string, string>
}

export interface PlatformComponentSpec {
  id: string
  platformType: string
  name: string
  props: Record<string, unknown>
  children?: PlatformComponentSpec[]
  style: Record<string, unknown>
  testId?: string
}
