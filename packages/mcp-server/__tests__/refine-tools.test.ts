import { describe, it, expect } from 'vitest'
import { handleRefinePrompt, isPromptVague, isFeaturePromptVague, generateFeatureAssumptions, handleFeatureRefine } from '../src/tools/refine.js'
import { handleRunPipeline } from '../src/tools/pipeline.js'

describe('dtc_refine_prompt handler', () => {
  describe('ask mode', () => {
    it('returns questions for a vague prompt', async () => {
      const result = await handleRefinePrompt({ prompt: 'todo app' })
      expect(result.isError).toBe(false)

      const parsed = JSON.parse(result.text)
      expect(parsed.mode).toBe('ask')
      expect(parsed.questions.length).toBeGreaterThan(0)
      expect(parsed.completenessScore).toBeLessThan(50)

      // Should ask about platform, screens, navigation at minimum
      const ids = parsed.questions.map((q: { id: string }) => q.id)
      expect(ids).toContain('platform')
      expect(ids).toContain('screens')
      expect(ids).toContain('navigation')
    })

    it('returns fewer questions for a detailed prompt', async () => {
      const detailed = 'A fitness tracker app with a home dashboard screen, workout log screen, and profile settings screen. Uses tab bar navigation with local data storage. Clean minimal design style.'
      const result = await handleRefinePrompt({ prompt: detailed })
      const parsed = JSON.parse(result.text)

      expect(parsed.completenessScore).toBeGreaterThan(50)
      // Should still ask about platform since it's not mentioned
      const ids = parsed.questions.map((q: { id: string }) => q.id)
      expect(ids).toContain('platform')
      // Should NOT ask about screens or navigation (already mentioned)
      expect(ids).not.toContain('screens')
      expect(ids).not.toContain('navigation')
    })

    it('skips platform question when platform is provided', async () => {
      const result = await handleRefinePrompt({ prompt: 'todo app', platform: 'swiftui' })
      const parsed = JSON.parse(result.text)

      const ids = parsed.questions.map((q: { id: string }) => q.id)
      expect(ids).not.toContain('platform')
    })

    it('skips platform question when prompt mentions swiftui', async () => {
      const result = await handleRefinePrompt({ prompt: 'a swiftui todo app' })
      const parsed = JSON.parse(result.text)

      const ids = parsed.questions.map((q: { id: string }) => q.id)
      expect(ids).not.toContain('platform')
    })
  })

  describe('enrich mode', () => {
    it('composes an enriched prompt from answers', async () => {
      const result = await handleRefinePrompt({
        prompt: 'todo app',
        mode: 'enrich',
        answers: JSON.stringify({
          platform: 'SwiftUI',
          screens: 'Home list, task detail, settings',
          navigation: 'Tab bar with 3 tabs',
          data_model: 'Local storage with SwiftData',
          design_style: 'Clean and minimal',
        }),
      })
      expect(result.isError).toBe(false)

      const parsed = JSON.parse(result.text)
      expect(parsed.mode).toBe('enrich')
      expect(parsed.originalPrompt).toBe('todo app')
      expect(parsed.enrichedPrompt).toContain('todo app')
      expect(parsed.enrichedPrompt).toContain('SwiftUI')
      expect(parsed.enrichedPrompt).toContain('Home list, task detail, settings')
      expect(parsed.enrichedPrompt).toContain('Tab bar with 3 tabs')
      expect(parsed.enrichedPrompt).toContain('SwiftData')
      expect(parsed.enrichedPrompt).toContain('Clean and minimal')
    })

    it('passes through extra answers', async () => {
      const result = await handleRefinePrompt({
        prompt: 'todo app',
        mode: 'enrich',
        answers: JSON.stringify({
          screens: 'Home and detail',
          special_features: 'Drag and drop reordering',
        }),
      })
      const parsed = JSON.parse(result.text)
      expect(parsed.enrichedPrompt).toContain('special features: Drag and drop reordering')
    })

    it('errors when answers are missing', async () => {
      const result = await handleRefinePrompt({ prompt: 'todo app', mode: 'enrich' })
      expect(result.isError).toBe(true)
    })

    it('errors on invalid JSON answers', async () => {
      const result = await handleRefinePrompt({ prompt: 'todo app', mode: 'enrich', answers: 'not json' })
      expect(result.isError).toBe(true)
    })
  })

  describe('error handling', () => {
    it('errors on unknown mode', async () => {
      const result = await handleRefinePrompt({ prompt: 'todo app', mode: 'unknown' })
      expect(result.isError).toBe(true)
    })
  })
})

describe('isPromptVague', () => {
  it('returns true for very short prompts', () => {
    expect(isPromptVague('todo app')).toBe(true)
    expect(isPromptVague('build me a weather app')).toBe(true)
  })

  it('returns false for detailed prompts', () => {
    const detailed = 'A fitness tracker with a home dashboard screen, workout log page, and profile settings. Uses tab bar navigation with local CoreData storage. Dark mode design with login via Apple Sign In.'
    expect(isPromptVague(detailed)).toBe(false)
  })

  it('returns false when platform is provided and prompt covers enough categories', () => {
    const prompt = 'A todo app with a list screen, detail screen, and tab navigation with local storage'
    expect(isPromptVague(prompt, 'swiftui')).toBe(false)
  })

  it('returns true even with platform if prompt is still vague', () => {
    expect(isPromptVague('todo app', 'swiftui')).toBe(true)
  })

  it('returns true for short core padded with structured sections', () => {
    // Agent pads a 3-word prompt with "Platform:", "Screens:", etc. to bypass the word count
    const padded = `hello world app

Platform: SwiftUI

Screens: Single screen with centered text

Navigation: None

Data & storage: None

Authentication: None

Design style: Clean and minimal`
    expect(isPromptVague(padded)).toBe(true)
  })

  it('returns true for short core even with many sections', () => {
    const padded = `fitness tracker app

Platform: swiftui

Screens: Dashboard (today's summary), Workout Log, Activity History, Profile/Settings

Navigation: Tab bar (bottom tabs)

Data & storage: Local only (on-device storage)

Authentication: No authentication

Design style: Clean and minimal`
    expect(isPromptVague(padded)).toBe(true)
  })

  it('returns false for genuinely detailed core description', () => {
    const detailed = `A fitness tracker that lets users log daily workouts with exercise type, duration, and calories burned. The dashboard shows today's summary with steps, calories, and active minutes in card widgets.

Screens: Dashboard, Workout Log, Activity History, Profile/Settings

Navigation: Tab bar (bottom tabs)`
    expect(isPromptVague(detailed)).toBe(false)
  })
})

describe('isFeaturePromptVague', () => {
  it('returns true for "add settings" (missing where + behavior, core < 6 words)', () => {
    expect(isFeaturePromptVague('add settings')).toBe(true)
  })

  it('returns false for a fully specified add-feature prompt', () => {
    expect(isFeaturePromptVague('add a search screen to the home tab that filters recipes by ingredient')).toBe(false)
  })

  it('returns true for single-word feature name (core < 6 words)', () => {
    expect(isFeaturePromptVague('settings')).toBe(true)
  })

  it('returns true for "add something cool" (missing what, where, behavior)', () => {
    expect(isFeaturePromptVague('add something cool')).toBe(true)
  })

  it('returns false for complete notification bell prompt', () => {
    expect(isFeaturePromptVague('add a notification bell button on the profile screen to show unread messages')).toBe(false)
  })

  it('returns true for short vague add-feature prompt with insufficient detail', () => {
    expect(isFeaturePromptVague('add a login button')).toBe(true)
  })
})

describe('generateFeatureAssumptions', () => {
  it('returns FeatureAssumptionResult with mode feature_assumptions for vague prompt', () => {
    const result = generateFeatureAssumptions('add settings', null)
    expect(result.mode).toBe('feature_assumptions')
    expect(result.originalPrompt).toBe('add settings')
    expect(result.assumptions.length).toBeGreaterThan(0)
    expect(result.summary).toMatch(/^I'll assume:/)
  })

  it('produces assumptions with expected categories', () => {
    const result = generateFeatureAssumptions('add settings', null)
    const categories = result.assumptions.map(a => a.category)
    // Should have at least one of type, placement, behavior, or data
    const validCategories = ['type', 'placement', 'behavior', 'data']
    expect(categories.some(c => validCategories.includes(c))).toBe(true)
  })

  it('includes a data assumption in all results', () => {
    const result = generateFeatureAssumptions('add settings', null)
    const dataAssumption = result.assumptions.find(a => a.category === 'data')
    expect(dataAssumption).toBeDefined()
  })
})

describe('handleFeatureRefine', () => {
  it('first call with vague prompt returns needs_confirmation with isError false', async () => {
    const result = await handleFeatureRefine({ prompt: 'add settings' })
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('needs_confirmation')
    expect(Array.isArray(parsed.assumptions)).toBe(true)
    expect(parsed.assumptions.length).toBeGreaterThan(0)
  })

  it('first call with specific prompt returns status specific', async () => {
    const result = await handleFeatureRefine({
      prompt: 'add a search screen to the home tab that filters recipes by ingredient',
    })
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('specific')
  })

  it('second call with confirmed true returns confirmed and enrichedPrompt', async () => {
    const result = await handleFeatureRefine({ prompt: 'add settings', confirmed: true })
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('confirmed')
    expect(parsed.enrichedPrompt).toContain('add settings')
  })
})

describe('dtc_run_pipeline vague prompt guard', () => {
  it('rejects vague prompts with needs_refinement status', async () => {
    const noop = async () => ({ report: { summary: {} }, markdown: '' })
    const result = await handleRunPipeline(
      { prompt: 'todo app', platform: 'swiftui', outputDir: '/tmp/test' },
      noop,
    )
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('needs_refinement')
  })

  it('rejects padded prompts with a short core description', async () => {
    const noop = async () => ({ report: { summary: {} }, markdown: '' })
    const padded = `hello world app

Platform: SwiftUI

Screens: Single screen with centered text

Navigation: None

Design style: Clean and minimal`
    const result = await handleRunPipeline(
      { prompt: padded, platform: 'swiftui', outputDir: '/tmp/test' },
      noop,
    )
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('needs_refinement')
  })

  it('allows detailed prompts through', async () => {
    const noop = async () => ({
      report: { summary: { allGreen: true } },
      markdown: '# Done',
    })
    const detailed = 'A todo app with a list screen showing tasks, detail screen for editing, tab navigation with home and settings tabs, local SwiftData storage, clean minimal design, no auth needed'
    const result = await handleRunPipeline(
      { prompt: detailed, platform: 'swiftui', outputDir: '/tmp/test' },
      noop,
    )
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('completed')
  })
})
