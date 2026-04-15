import type {
  AppContext,
  ModificationPlan,
  ModificationItem,
  ModificationChangeType,
  Runner,
} from '@appifex/core'
import { join, resolve } from 'node:path'

// Phase 02 Plan 02 (FOUND-02): Swift averages ~3 chars/token, not 4
const CHARS_PER_TOKEN = 3
const MODIFICATION_TOKEN_CAP = 8_000 // ~24,000 chars for file contents (Swift density)
const CHANGE_TYPE_PRIORITY: ModificationChangeType[] = [
  'navigation',
  'layout',
  'button',
  'form',
  'other',
]

type CreateMessageFn = (params: {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: any }>
}) => Promise<{
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}>

export async function planModifications(
  prompt: string,
  appContext: AppContext,
  outputDir: string,
  runner: Runner,
  createMessage: CreateMessageFn,
): Promise<ModificationPlan> {
  const inventoryLines = appContext.inventory
    .map((entry) => `- ${entry.name} (${entry.type}) — ${entry.filePath}`)
    .join('\n')

  const navGraphLines = appContext.navGraph
    .map((node) => `- ${node.screenId} [${node.type}] -> ${node.targets.join(', ')}`)
    .join('\n')

  const entryPointStr = `Entry point: ${appContext.entryPoint ?? 'unknown'}`

  const userPromptText = [
    `Feature request: ${prompt}`,
    '',
    `## File Inventory`,
    inventoryLines,
    '',
    `## Navigation Graph`,
    navGraphLines,
    '',
    entryPointStr,
    '',
    'Analyze the feature request against the existing project. Determine which existing files need modification.',
    'Output ONLY a JSON object: { "items": [{ "filePath": string, "screenName": string, "changeDescription": string, "changeType": "navigation"|"layout"|"button"|"form"|"other" }], "reasoning": string }.',
    'If no existing files need changing, return { "items": [], "reasoning": "..." }.',
  ].join('\n')

  const response = await createMessage({
    model: 'default',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userPromptText }],
  })

  const rawText = response.content.find((c) => c.type === 'text')?.text ?? ''

  // Extract JSON from response — find first { and last }
  const firstBrace = rawText.indexOf('{')
  const lastBrace = rawText.lastIndexOf('}')

  let parsed: {
    items: Array<{
      filePath: string
      screenName: string
      changeDescription: string
      changeType: string
    }>
    reasoning?: string
  } | null = null

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = rawText.slice(firstBrace, lastBrace + 1)
    try {
      parsed = JSON.parse(jsonSubstring)
    } catch {
      // Fall through to error handling below
    }
  }

  if (parsed === null) {
    // Write raw response to debug file and return empty plan
    await runner.writeFile(join(outputDir, '.dtc-debug', 'modification-plan-raw.txt'), rawText)
    return { items: [] }
  }

  const resolvedOutputDir = resolve(outputDir)

  // Load fileContent for each item, skipping items where readFile throws
  const items: ModificationItem[] = []
  for (const rawItem of parsed.items ?? []) {
    const resolvedPath = resolve(join(resolvedOutputDir, rawItem.filePath))

    // T-07-01: Validate resolved path starts with outputDir to prevent path traversal
    if (!resolvedPath.startsWith(resolvedOutputDir + '/') && resolvedPath !== resolvedOutputDir) {
      console.warn(`[modification-planner] Skipping item with suspicious path: ${rawItem.filePath}`)
      continue
    }

    try {
      const fileContent = await runner.readFile(resolvedPath)
      items.push({
        filePath: rawItem.filePath,
        screenName: rawItem.screenName,
        changeDescription: rawItem.changeDescription,
        changeType: rawItem.changeType as ModificationChangeType,
        fileContent,
      })
    } catch (err) {
      console.warn(
        `[modification-planner] Skipping item, could not read file: ${rawItem.filePath} — ${err}`,
      )
    }
  }

  // T-07-03: Token budget enforcement — sort by priority and truncate to fit budget
  const maxChars = MODIFICATION_TOKEN_CAP * CHARS_PER_TOKEN

  const totalChars = items.reduce((sum, item) => sum + item.fileContent.length, 0)
  if (totalChars > maxChars) {
    items.sort((a, b) => {
      const ai = CHANGE_TYPE_PRIORITY.indexOf(a.changeType)
      const bi = CHANGE_TYPE_PRIORITY.indexOf(b.changeType)
      return ai - bi
    })

    let runningChars = 0
    const truncated: ModificationItem[] = []
    for (const item of items) {
      if (runningChars + item.fileContent.length > maxChars) break
      truncated.push(item)
      runningChars += item.fileContent.length
    }
    return { items: truncated, reasoning: parsed.reasoning }
  }

  return { items, reasoning: parsed.reasoning }
}
