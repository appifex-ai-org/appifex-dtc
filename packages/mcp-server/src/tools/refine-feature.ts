/** Feature-specific vagueness detection and add-feature refinement */

import type { AppContext } from '@appifex/core'
import { hasKeywords, extractCoreDescription, wordCount } from './refine-keywords.js'

// ── Feature-specific keyword arrays ──

const FEATURE_WHAT_KEYWORDS = [
  'screen',
  'page',
  'view',
  'tab',
  'button',
  'action',
  'list',
  'section',
  'modal',
  'sheet',
  'form',
  'input',
  'widget',
  'card',
  'menu',
  'option',
  'toggle',
  'setting',
  'notification',
  'filter',
  'sort',
  'search',
]

const FEATURE_WHERE_KEYWORDS = [
  'to',
  'on',
  'in',
  'inside',
  'from',
  'navigation',
  'tab bar',
  'home',
  'settings',
  'profile',
  'detail',
  'existing',
  'current',
  'main',
]

const FEATURE_BEHAVIOR_KEYWORDS = [
  'show',
  'display',
  'let',
  'allow',
  'enable',
  'create',
  'add',
  'delete',
  'edit',
  'update',
  'save',
  'load',
  'fetch',
  'send',
  'navigate',
  'open',
  'view',
  'manage',
  'track',
  'list',
  'store',
  'share',
]

// ── Types ──

export interface FeatureAssumption {
  id: string
  category: 'type' | 'placement' | 'behavior' | 'data'
  description: string
}

export interface FeatureAssumptionResult {
  mode: 'feature_assumptions'
  originalPrompt: string
  assumptions: FeatureAssumption[]
  summary: string
}

// ── Feature vagueness detection ──

export function isFeaturePromptVague(prompt: string): boolean {
  const coreDescription = extractCoreDescription(prompt)
  if (wordCount(coreDescription) < 6) return true

  const hasWhat = hasKeywords(prompt, FEATURE_WHAT_KEYWORDS)
  const hasWhere = hasKeywords(prompt, FEATURE_WHERE_KEYWORDS)
  const hasBehavior = hasKeywords(prompt, FEATURE_BEHAVIOR_KEYWORDS)

  return !hasWhat || !hasWhere || !hasBehavior
}

// ── Feature assumptions generation ──

export function generateFeatureAssumptions(
  prompt: string,
  appContext?: AppContext | null,
): FeatureAssumptionResult {
  const assumptions: FeatureAssumption[] = []
  const promptLower = prompt.toLowerCase()

  // Infer type
  const screenWords = ['screen', 'page', 'view']
  const hasScreenWord = screenWords.some((w) => promptLower.includes(w))
  if (!hasScreenWord) {
    assumptions.push({
      id: 'type-1',
      category: 'type',
      description: `Adding a new screen for "${extractCoreDescription(prompt)}"`,
    })
  }

  // Infer placement
  const hasPlacement = hasKeywords(prompt, FEATURE_WHERE_KEYWORDS)
  if (!hasPlacement) {
    const hasTabNav = appContext?.navGraph?.some((n) => n.type === 'tab') ?? false
    const navType = hasTabNav ? 'tab bar' : 'navigation stack'
    assumptions.push({
      id: 'placement-1',
      category: 'placement',
      description: `${navType.charAt(0).toUpperCase() + navType.slice(1)} navigation entry`,
    })
  }

  // Infer behavior
  const hasBehavior = hasKeywords(prompt, FEATURE_BEHAVIOR_KEYWORDS)
  if (!hasBehavior) {
    assumptions.push({
      id: 'behavior-1',
      category: 'behavior',
      description: `Display and manage ${extractCoreDescription(prompt)} data`,
    })
  }

  // Always add a data assumption
  assumptions.push({
    id: 'data-1',
    category: 'data',
    description: 'Local storage (no network calls)',
  })

  const summary =
    assumptions.length > 0
      ? "I'll assume:\n" + assumptions.map((a) => `  - ${a.description}`).join('\n')
      : 'Could not infer assumptions — please provide a more specific prompt.'

  return { mode: 'feature_assumptions', originalPrompt: prompt, assumptions, summary }
}

// ── Feature MCP handler ──

export async function handleFeatureRefine(args: {
  prompt: string
  confirmed?: boolean
  appContext?: AppContext | null
}): Promise<{ text: string; isError: boolean }> {
  // D-09: Two-step handshake
  if (!args.confirmed) {
    // First call: check vagueness and return assumptions
    if (!isFeaturePromptVague(args.prompt)) {
      // Prompt is already specific enough — no assumptions needed
      return {
        text: JSON.stringify({ status: 'specific', prompt: args.prompt }),
        isError: false,
      }
    }
    const result = generateFeatureAssumptions(args.prompt, args.appContext)
    return {
      text: JSON.stringify({
        status: 'needs_confirmation',
        assumptions: result.assumptions,
        summary: result.summary,
        hint: 'Call dtc_refine_feature_prompt again with confirmed=true to proceed, or supply a more detailed prompt.',
      }),
      isError: false, // NOT an error — structured response per UI-SPEC
    }
  }

  // Second call: confirmed=true — generate enriched prompt from assumptions
  const result = generateFeatureAssumptions(args.prompt, args.appContext)
  const enrichedParts = [args.prompt]
  for (const a of result.assumptions) {
    enrichedParts.push(a.description)
  }
  const enrichedPrompt = enrichedParts.join('. ')

  return {
    text: JSON.stringify({ status: 'confirmed', enrichedPrompt }),
    isError: false,
  }
}
