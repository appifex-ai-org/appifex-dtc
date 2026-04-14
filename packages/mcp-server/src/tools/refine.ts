/** Prompt refinement — deterministic, no LLM calls */

// ── Re-exports from sub-modules (preserve existing import paths) ──
export { hasKeywords, isPromptVague } from './refine-keywords.js'
export type { RefinementQuestion, AskResult, EnrichResult } from './refine-keywords.js'
export {
  isFeaturePromptVague,
  generateFeatureAssumptions,
  handleFeatureRefine,
} from './refine-feature.js'
export type { FeatureAssumption, FeatureAssumptionResult } from './refine-feature.js'

// ── Imports for local use ──
import type { RefinementQuestion, AskResult, EnrichResult } from './refine-keywords.js'
import {
  hasKeywords,
  wordCount,
  SCREEN_KEYWORDS, NAV_KEYWORDS, DATA_KEYWORDS,
  AUTH_KEYWORDS, DESIGN_KEYWORDS, PLATFORM_KEYWORDS,
} from './refine-keywords.js'

// ── Ask mode: generate questions ──

function generateQuestions(prompt: string, platform?: string): AskResult {
  const questions: RefinementQuestion[] = []
  let covered = 0
  const totalCategories = 6

  // Platform
  if (platform || hasKeywords(prompt, PLATFORM_KEYWORDS)) {
    covered++
  } else {
    questions.push({
      id: 'platform',
      question: 'What platform should this be built for?',
      category: 'Platform',
      options: ['SwiftUI (iOS native)', 'Kotlin Compose (Android native)'],
      required: true,
    })
  }

  // Screens
  if (hasKeywords(prompt, SCREEN_KEYWORDS)) {
    covered++
  } else {
    questions.push({
      id: 'screens',
      question: 'What screens or pages should the app have? (e.g., home, detail, settings, profile)',
      category: 'Screens',
      required: true,
    })
  }

  // Navigation
  if (hasKeywords(prompt, NAV_KEYWORDS)) {
    covered++
  } else {
    questions.push({
      id: 'navigation',
      question: 'What navigation pattern should the app use?',
      category: 'Navigation',
      options: ['Tab bar (bottom tabs)', 'Stack navigation (push/pop)', 'Drawer / sidebar', 'Simple (single screen)'],
      required: true,
    })
  }

  // Data model
  if (hasKeywords(prompt, DATA_KEYWORDS)) {
    covered++
  } else {
    questions.push({
      id: 'data_model',
      question: 'How should the app store and manage data?',
      category: 'Data',
      options: ['Local only (on-device storage)', 'Connects to a backend API', 'No persistence needed (static content)'],
      required: false,
    })
  }

  // Auth
  if (hasKeywords(prompt, AUTH_KEYWORDS)) {
    covered++
  } else if (wordCount(prompt) < 15) {
    questions.push({
      id: 'auth',
      question: 'Does the app need user authentication (login/signup)?',
      category: 'Features',
      options: ['No authentication', 'Email/password', 'Social login (Google, Apple)', 'Biometric (Face ID / Touch ID)'],
      required: false,
    })
  } else {
    covered++
  }

  // Design style
  if (hasKeywords(prompt, DESIGN_KEYWORDS)) {
    covered++
  } else if (wordCount(prompt) < 20) {
    questions.push({
      id: 'design_style',
      question: 'What visual style do you prefer?',
      category: 'Design',
      options: ['Clean and minimal', 'Colorful and playful', 'Dark mode focused', 'Native platform style'],
      required: false,
    })
  } else {
    covered++
  }

  const completenessScore = Math.round((covered / totalCategories) * 100)

  return {
    mode: 'ask',
    prompt,
    completenessScore,
    questions,
    hint: 'Or just say "just build it" to skip all questions and build with sensible defaults.',
  }
}

// ── Enrich mode: compose detailed prompt ──

function enrichPrompt(prompt: string, answers: Record<string, string>, platform?: string): EnrichResult {
  const sections: string[] = []

  // Base description
  sections.push(prompt.trim())

  // Platform context
  if (answers.platform) {
    sections.push(`Platform: ${answers.platform}`)
  } else if (platform) {
    sections.push(`Platform: ${platform}`)
  }

  // Screens
  if (answers.screens) {
    sections.push(`Screens: ${answers.screens}`)
  }

  // Navigation
  if (answers.navigation) {
    sections.push(`Navigation: ${answers.navigation}`)
  }

  // Data model
  if (answers.data_model) {
    sections.push(`Data & storage: ${answers.data_model}`)
  }

  // Auth
  if (answers.auth) {
    sections.push(`Authentication: ${answers.auth}`)
  }

  // Design style
  if (answers.design_style) {
    sections.push(`Design style: ${answers.design_style}`)
  }

  // Pass through any extra answers the agent collected
  const knownIds = new Set(['platform', 'screens', 'navigation', 'data_model', 'auth', 'design_style'])
  for (const [key, value] of Object.entries(answers)) {
    const strValue = typeof value === 'string' ? value : String(value)
    if (!knownIds.has(key) && strValue.trim()) {
      sections.push(`${key.replace(/_/g, ' ')}: ${strValue}`)
    }
  }

  return {
    mode: 'enrich',
    originalPrompt: prompt,
    enrichedPrompt: sections.join('\n\n'),
  }
}

// ── MCP handler ──

export async function handleRefinePrompt(args: {
  prompt: string
  mode?: string
  answers?: string
  platform?: string
}): Promise<{ text: string; isError: boolean }> {
  try {
    const mode = args.mode ?? 'ask'

    if (mode === 'ask') {
      const result = generateQuestions(args.prompt, args.platform)
      result.hint = 'IMPORTANT: When presenting these questions to the user, you MUST include this note at the end: "Or just say \\"just build it\\" to skip all questions and build with sensible defaults."'
      return { text: JSON.stringify(result, null, 2), isError: false }
    }

    if (mode === 'enrich') {
      if (!args.answers) {
        return {
          text: JSON.stringify({ error: 'enrich mode requires "answers" parameter (JSON object)' }),
          isError: true,
        }
      }
      let answers: Record<string, string>
      try {
        answers = JSON.parse(args.answers)
      } catch {
        return {
          text: JSON.stringify({ error: 'Invalid JSON in "answers" parameter' }),
          isError: true,
        }
      }
      const result = enrichPrompt(args.prompt, answers, args.platform)
      return { text: JSON.stringify(result, null, 2), isError: false }
    }

    return {
      text: JSON.stringify({ error: `Unknown mode "${mode}". Use "ask" or "enrich".` }),
      isError: true,
    }
  } catch (err) {
    return {
      text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      isError: true,
    }
  }
}
