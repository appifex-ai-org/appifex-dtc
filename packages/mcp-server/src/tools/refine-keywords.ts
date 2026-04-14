/** Prompt refinement — keyword detection and vagueness utilities */

export interface RefinementQuestion {
  id: string
  question: string
  category: string
  options?: string[]
  required: boolean
}

export interface AskResult {
  mode: 'ask'
  prompt: string
  completenessScore: number
  questions: RefinementQuestion[]
  hint: string
}

export interface EnrichResult {
  mode: 'enrich'
  originalPrompt: string
  enrichedPrompt: string
}

// ── Keyword detection helpers ──

export const SCREEN_KEYWORDS = [
  'screen', 'page', 'view', 'tab', 'modal', 'sheet', 'detail',
  'list', 'home', 'settings', 'profile', 'dashboard', 'onboarding',
  'login', 'signup', 'sign up', 'register', 'feed', 'search',
]

export const NAV_KEYWORDS = [
  'tab', 'tabs', 'tab bar', 'stack', 'drawer', 'sidebar',
  'navigation', 'bottom bar', 'menu',
]

export const DATA_KEYWORDS = [
  'data', 'database', 'storage', 'persist', 'save', 'store',
  'core data', 'swiftdata', 'realm', 'sqlite', 'api', 'backend',
  'server', 'fetch', 'sync', 'offline', 'cache', 'local',
]

export const AUTH_KEYWORDS = [
  'auth', 'login', 'signup', 'sign up', 'register', 'password',
  'oauth', 'google sign', 'apple sign', 'biometric', 'face id', 'touch id',
]

export const DESIGN_KEYWORDS = [
  'dark', 'light', 'minimal', 'colorful', 'modern', 'flat',
  'gradient', 'rounded', 'theme', 'color', 'style', 'design',
  'material', 'ios', 'native', 'custom',
]

export const PLATFORM_KEYWORDS = [
  'swiftui', 'swift', 'ios', 'apple',
  'android', 'kotlin', 'compose', 'kotlin-compose',
]

export function hasKeywords(prompt: string, keywords: string[]): boolean {
  const lower = prompt.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

export function wordCount(prompt: string): number {
  return prompt.trim().split(/\s+/).length
}

/**
 * Returns true when a prompt is too vague to run the pipeline directly.
 *
 * Two-layer heuristic:
 * 1. Extract the **core description** — the first paragraph/line before any
 *    structured "Key: value" sections.  If the core is very short (< 8 words)
 *    the prompt is vague regardless of how many boilerplate sections were
 *    appended (prevents agents from padding a thin prompt to bypass the check).
 * 2. Fall back to the original category-coverage heuristic for medium-length
 *    prompts.
 */
export function isPromptVague(prompt: string, platform?: string): boolean {
  // Layer 1: extract core description (text before first "Key: value" section)
  const coreDescription = extractCoreDescription(prompt)
  const coreWords = wordCount(coreDescription)

  let covered = 0
  const totalCategories = 6
  if (platform || hasKeywords(prompt, PLATFORM_KEYWORDS)) covered++
  if (hasKeywords(prompt, SCREEN_KEYWORDS)) covered++
  if (hasKeywords(prompt, NAV_KEYWORDS)) covered++
  if (hasKeywords(prompt, DATA_KEYWORDS)) covered++
  if (hasKeywords(prompt, AUTH_KEYWORDS)) covered++
  if (hasKeywords(prompt, DESIGN_KEYWORDS)) covered++

  // If the core description is very short, the prompt is vague even if
  // structured sections were appended (prevents agents from padding a thin prompt)
  if (coreWords < 8) return true

  const words = wordCount(prompt)
  // Long prompts with a substantive core are assumed detailed enough
  if (words >= 30) return false

  // Vague = covers fewer than half the categories
  return covered < totalCategories / 2
}

/**
 * Extract the core app description from a prompt, stripping structured
 * "Key: value" sections that may have been appended by an agent.
 * e.g. "fitness tracker app\n\nPlatform: swiftui\n\nScreens: ..." → "fitness tracker app"
 */
export function extractCoreDescription(prompt: string): string {
  const lines = prompt.split('\n')
  const coreLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Stop at first structured section header (e.g. "Platform:", "Screens:", "Navigation:")
    if (/^[A-Za-z][A-Za-z &\/]+:\s/i.test(trimmed)) break
    if (trimmed) coreLines.push(trimmed)
  }

  return coreLines.join(' ').trim() || prompt.split('\n')[0].trim()
}
