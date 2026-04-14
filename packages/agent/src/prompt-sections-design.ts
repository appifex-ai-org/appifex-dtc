import type { PlatformSpec, PlatformComponentSpec, ModificationPlan } from '@appifex/core'

// ── TestID Reference (minimal — just the IDs the agent needs to set) ──

export function buildTestIdReference(spec: PlatformSpec): string {
  const lines: string[] = []
  lines.push(`## Accessibility Identifiers (from spec — use these on your views)`)
  lines.push('')
  lines.push(
    `The following \`accessibilityIdentifier\` values must be set on the corresponding UI elements. These are used by the Maestro UI tests.`,
  )
  lines.push('')
  lines.push(
    `**IMPORTANT:** The spec below may be INCOMPLETE. The design image is the source of truth for what screens and components to build. This section only tells you what testIds to set.`,
  )

  for (const screen of spec.screens) {
    if (Object.keys(screen.testIds).length === 0) continue
    lines.push('')
    lines.push(`### ${screen.name} (\`${screen.componentName}\`)`)
    lines.push(`> ${screen.description}`)

    for (const [, testId] of Object.entries(screen.testIds)) {
      // Find component to show what type it is
      const comp = findComponent(screen.components, testId)
      const typeHint = comp ? ` — ${comp.platformType}: ${comp.name}` : ''
      lines.push(`- \`.accessibilityIdentifier("${testId}")\`${typeHint}`)
    }
  }

  return lines.join('\n')
}

export function findComponent(
  comps: PlatformComponentSpec[],
  testId: string,
): PlatformComponentSpec | null {
  for (const c of comps) {
    if (c.testId === testId) return c
    if (c.children) {
      const found = findComponent(c.children, testId)
      if (found) return found
    }
  }
  return null
}

// ── Design Tokens ──

export function buildDesignTokensSection(
  tokens: PlatformSpec['designTokens'],
  fromExtraction: boolean,
): string {
  if (fromExtraction) {
    // Tokens extracted deterministically from .pen file — authoritative
    const lines: string[] = ['## Design Tokens (extracted from design file — USE THESE)']
    lines.push('These tokens were extracted directly from the design file. Use them as-is.')

    if (tokens.colors && Object.keys(tokens.colors).length > 0) {
      lines.push('')
      lines.push('**Colors:**')
      for (const [name, value] of Object.entries(tokens.colors)) {
        lines.push(`- \`${name}\`: \`${value}\``)
      }
    }
    if (tokens.typography && Object.keys(tokens.typography).length > 0) {
      lines.push('')
      lines.push('**Typography:**')
      for (const [name, token] of Object.entries(tokens.typography)) {
        lines.push(`- \`${name}\`: ${token.fontFamily} ${token.fontSize}pt ${token.fontWeight}`)
      }
    }
    if (tokens.spacing && Object.keys(tokens.spacing).length > 0) {
      lines.push('')
      lines.push('**Spacing:**')
      for (const [name, value] of Object.entries(tokens.spacing)) {
        lines.push(`- \`${name}\`: ${value}pt`)
      }
    }
    if (tokens.borderRadius && Object.keys(tokens.borderRadius).length > 0) {
      lines.push('')
      lines.push('**Border Radius:**')
      for (const [name, value] of Object.entries(tokens.borderRadius)) {
        lines.push(`- \`${name}\`: ${value}pt`)
      }
    }

    return lines.join('\n')
  }

  // Fallback — tokens from LLM, may be wrong
  const lines: string[] = ['## Design Tokens (FALLBACK — prefer what you see in the design image)']
  lines.push(
    'These tokens were extracted by a separate AI. They may be WRONG. Use the design image colors if they differ.',
  )

  if (tokens.colors && Object.keys(tokens.colors).length > 0) {
    lines.push('')
    lines.push('**Colors (verify against design image):**')
    for (const [name, value] of Object.entries(tokens.colors)) {
      lines.push(`- \`${name}\`: \`${value}\``)
    }
  }
  if (tokens.typography && Object.keys(tokens.typography).length > 0) {
    lines.push('')
    lines.push('**Typography:**')
    for (const [name, token] of Object.entries(tokens.typography)) {
      lines.push(`- \`${name}\`: ${token.fontFamily} ${token.fontSize}pt ${token.fontWeight}`)
    }
  }

  return lines.join('\n')
}

// ── Existing Design Tokens (add-feature mode — loaded from existing .pen file) ──

export function buildExistingDesignTokensSection(tokens: PlatformSpec['designTokens']): string {
  const lines: string[] = ['## Existing Design Tokens (from existing app — USE THESE EXACTLY)']
  lines.push(
    "These tokens were loaded from the existing app's design file. Match them exactly so new features blend seamlessly.",
  )

  if (tokens.colors && Object.keys(tokens.colors).length > 0) {
    lines.push('')
    lines.push('**Colors:**')
    for (const [name, value] of Object.entries(tokens.colors)) {
      lines.push(`- \`${name}\`: \`${value}\``)
    }
  }
  if (tokens.typography && Object.keys(tokens.typography).length > 0) {
    lines.push('')
    lines.push('**Typography:**')
    for (const [name, token] of Object.entries(tokens.typography)) {
      lines.push(`- \`${name}\`: ${token.fontFamily} ${token.fontSize}pt ${token.fontWeight}`)
    }
  }
  if (tokens.spacing && Object.keys(tokens.spacing).length > 0) {
    lines.push('')
    lines.push('**Spacing:**')
    for (const [name, value] of Object.entries(tokens.spacing)) {
      lines.push(`- \`${name}\`: ${value}pt`)
    }
  }
  if (tokens.borderRadius && Object.keys(tokens.borderRadius).length > 0) {
    lines.push('')
    lines.push('**Border Radius:**')
    for (const [name, value] of Object.entries(tokens.borderRadius)) {
      lines.push(`- \`${name}\`: ${value}pt`)
    }
  }

  return lines.join('\n')
}

// ── Modification Plan (add-feature mode — existing files the agent must modify, per D-05) ──

export function buildModificationPlanSection(plan: ModificationPlan): string {
  const lines: string[] = []
  lines.push('## Modification Plan (files you MUST modify)')
  lines.push('')
  lines.push(
    'The following EXISTING files must be changed to integrate the new feature. Full file content is provided below. Output the complete modified file.',
  )
  lines.push('')
  lines.push('DO NOT modify any files not listed here.')

  for (const item of plan.items) {
    lines.push('')
    lines.push(`### ${item.screenName} (${item.changeType})`)
    lines.push(`**Change:** ${item.changeDescription}`)
    lines.push(`**File path:** ${item.filePath}`)
    lines.push('')
    // Determine language for code fence
    const lang = item.filePath.endsWith('.swift')
      ? 'swift'
      : item.filePath.endsWith('.kt')
        ? 'kotlin'
        : ''
    lines.push(`\`\`\`${lang}`)
    lines.push(item.fileContent)
    lines.push('```')
  }

  return lines.join('\n')
}

// ── Icon Reference ──

export function buildIconReference(spec: PlatformSpec): string | null {
  const iconComps = spec.screens
    .flatMap((s) => flattenPlatformComps(s.components))
    .filter((c) => c.props.sfSymbolName)

  if (iconComps.length === 0) return null

  // Deduplicate by SF Symbol name
  const seen = new Set<string>()
  const unique: typeof iconComps = []
  for (const c of iconComps) {
    const sf = c.props.sfSymbolName as string
    if (!seen.has(sf)) {
      seen.add(sf)
      unique.push(c)
    }
  }

  const lines = ['## Icon Reference (SF Symbols — extracted from design)']
  lines.push('Use these exact SF Symbol names in your SwiftUI code:')
  lines.push('')
  for (const comp of unique) {
    const origin = comp.props.iconFontFamily
      ? ` (design: \`${comp.props.iconFontFamily}:${comp.props.iconFontName}\`)`
      : ''
    lines.push(`- \`Image(systemName: "${comp.props.sfSymbolName}")\` — ${comp.name}${origin}`)
  }
  return lines.join('\n')
}

export function flattenPlatformComps(comps: PlatformComponentSpec[]): PlatformComponentSpec[] {
  const result: PlatformComponentSpec[] = []
  for (const c of comps) {
    result.push(c)
    if (c.children) result.push(...flattenPlatformComps(c.children))
  }
  return result
}
