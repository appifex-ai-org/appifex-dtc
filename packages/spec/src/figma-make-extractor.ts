import type { DesignSpec, Platform } from '@appifex/core'
import { generateSpecFromPrompt, type CreateMessageFn } from './generate-spec.js'

// Tailwind CSS color palette — maps color class names to hex values
const TAILWIND_COLORS: Record<string, string> = {
  'red-400': '#F87171',
  'red-500': '#EF4444',
  'red-600': '#DC2626',
  'orange-400': '#FB923C',
  'orange-500': '#F97316',
  'orange-600': '#EA580C',
  'amber-400': '#FBBF24',
  'amber-500': '#F59E0B',
  'amber-600': '#D97706',
  'yellow-400': '#FACC15',
  'yellow-500': '#EAB308',
  'yellow-600': '#CA8A04',
  'green-400': '#4ADE80',
  'green-500': '#22C55E',
  'green-600': '#16A34A',
  'emerald-400': '#34D399',
  'emerald-500': '#10B981',
  'emerald-600': '#059669',
  'teal-400': '#2DD4BF',
  'teal-500': '#14B8A6',
  'teal-600': '#0D9488',
  'cyan-400': '#22D3EE',
  'cyan-500': '#06B6D4',
  'cyan-600': '#0891B2',
  'blue-400': '#60A5FA',
  'blue-500': '#3B82F6',
  'blue-600': '#2563EB',
  'indigo-400': '#818CF8',
  'indigo-500': '#6366F1',
  'indigo-600': '#4F46E5',
  'violet-400': '#A78BFA',
  'violet-500': '#8B5CF6',
  'violet-600': '#7C3AED',
  'purple-400': '#C084FC',
  'purple-500': '#A855F7',
  'purple-600': '#9333EA',
  'pink-400': '#F472B6',
  'pink-500': '#EC4899',
  'pink-600': '#DB2777',
  'rose-400': '#FB7185',
  'rose-500': '#F43F5E',
  'rose-600': '#E11D48',
  'gray-50': '#F9FAFB',
  'gray-100': '#F3F4F6',
  'gray-200': '#E5E7EB',
  'gray-300': '#D1D5DB',
  'gray-400': '#9CA3AF',
  'gray-500': '#6B7280',
  'gray-600': '#4B5563',
  'gray-700': '#374151',
  'gray-800': '#1F2937',
  'gray-900': '#111827',
  'slate-50': '#F8FAFC',
  'slate-100': '#F1F5F9',
  'slate-200': '#E2E8F0',
  'slate-300': '#CBD5E1',
  'slate-400': '#94A3B8',
  'slate-500': '#64748B',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1E293B',
  'slate-900': '#0F172A',
  'zinc-50': '#FAFAFA',
  'zinc-100': '#F4F4F5',
  'zinc-200': '#E4E4E7',
  'zinc-300': '#D4D4D8',
  'zinc-400': '#A1A1AA',
  'zinc-500': '#71717A',
  'zinc-600': '#52525B',
  'zinc-700': '#3F3F46',
  'zinc-800': '#27272A',
  'zinc-900': '#18181B',
  white: '#FFFFFF',
  black: '#000000',
}

/**
 * Extract Tailwind color class names from code and resolve to hex values.
 * Matches patterns like bg-blue-600, text-emerald-500, border-gray-300, etc.
 */
export function parseTailwindColors(code: string): Record<string, string> {
  const colors: Record<string, string> = {}
  // Match Tailwind color utilities: bg-, text-, border-, ring-, from-, to-, via-
  const regex =
    /(?:bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|accent|caret|decoration)-([a-z]+-\d{2,3}|white|black)/g
  let match
  while ((match = regex.exec(code)) !== null) {
    const colorName = match[1]
    const hex = TAILWIND_COLORS[colorName]
    if (hex) {
      colors[colorName] = hex
    }
  }
  return colors
}

export interface ExtractSpecFromFigmaMakeOpts {
  /** React/Tailwind code from Figma MCP get_design_context */
  codeContent: string
  /** Metadata from Figma MCP get_design_context */
  metadata: Record<string, unknown>
  /** Screenshot paths from Figma MCP get_screenshot */
  screenshotPaths: string[]
  prompt: string
  platform: Platform
  createMessage: CreateMessageFn
  model?: string
  skillPrompt?: string
  outputDir?: string
  /** Whether the LLM provider supports image inputs. Default: true */
  canSendImages?: boolean
}

/**
 * Build a DesignSpec from Figma Make artifacts:
 * 1. Parse Tailwind colors from code → deterministic design tokens
 * 2. Feed screenshot + code to LLM → ScreenSpec[] (vision)
 * 3. Merge: deterministic Tailwind colors override LLM-generated colors
 */
export async function extractSpecFromFigmaMake(
  opts: ExtractSpecFromFigmaMakeOpts,
): Promise<{ spec: DesignSpec; tokensUsed: number }> {
  // 1. Parse deterministic color tokens from Tailwind code
  const tailwindColors = parseTailwindColors(opts.codeContent)

  // 2. Build enhanced prompt with Figma code context
  let enhancedPrompt = opts.prompt
  if (opts.codeContent) {
    enhancedPrompt = `${opts.prompt}\n\n## Code from Figma Make Design\n\`\`\`html\n${opts.codeContent}\n\`\`\``
  }
  if (Object.keys(tailwindColors).length > 0) {
    const colorSummary = Object.entries(tailwindColors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    enhancedPrompt += `\n\n## Design Tokens (from Tailwind classes)\nColors: ${colorSummary}`
  }

  // 3. Generate spec via LLM vision using the first screenshot
  const canSendImages = opts.canSendImages !== false
  const designImagePath = canSendImages ? opts.screenshotPaths[0] : undefined
  const result = await generateSpecFromPrompt({
    prompt: enhancedPrompt,
    platform: opts.platform,
    createMessage: opts.createMessage,
    model: opts.model,
    skillPrompt: opts.skillPrompt,
    designImagePath,
    outputDir: opts.outputDir,
  })

  // 4. Merge: deterministic Tailwind colors override LLM-generated colors
  if (Object.keys(tailwindColors).length > 0) {
    result.spec.designTokens = {
      ...result.spec.designTokens,
      colors: { ...result.spec.designTokens.colors, ...tailwindColors },
    }
  }

  return result
}
