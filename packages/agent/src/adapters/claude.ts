import { readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { which } from '../util.js'

/** Validate session ID format (UUID) */
function isValidSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
import { spawnAgentStreamJson } from './base.js'
import type { AgentAdapter, AgentRunOpts, AgentResult } from '../types.js'

const DESIGN_SYSTEM_PROMPT = `CRITICAL: The user message includes the design image inline. Study it carefully — it is your PRIMARY source of truth for the app's visual design. The spec JSON may be incomplete or wrong. If they conflict, the DESIGN IMAGE wins.

After implementing views, take a simulator screenshot and compare it against the design. Fix any visual differences you find.`

export class ClaudeCodeAgent implements AgentAdapter {
  readonly name = 'claude' as const

  async run(opts: AgentRunOpts): Promise<AgentResult> {
    const args = [
      '--print',
      '--verbose',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--model',
      opts.model ?? 'claude-sonnet-4-6',
      '--max-budget-usd',
      String(opts.maxBudgetUsd ?? 10),
      '--allowedTools',
      'Edit,Write,Read,Bash,Glob,Grep,mcp__pencil__get_screenshot,mcp__pencil__batch_get,mcp__pencil__export_nodes,mcp__pencil__get_variables',
    ]

    // Resume a previous session instead of starting fresh
    if (opts.resumeSessionId) {
      if (!isValidSessionId(opts.resumeSessionId)) {
        throw new Error(`Invalid session ID format: ${opts.resumeSessionId}`)
      }
      args.push('--resume', opts.resumeSessionId)
    }

    if (opts.designImagePath && !opts.resumeSessionId) {
      args.push('--append-system-prompt', DESIGN_SYSTEM_PROMPT)
    }

    // Build multimodal message content
    const content: Array<Record<string, unknown>> = []

    // Embed design image directly in the message (only for new sessions)
    if (opts.designImagePath && !opts.resumeSessionId) {
      try {
        const imagePath = resolve(opts.cwd, opts.designImagePath)
        // Guard against path traversal outside cwd
        const relPath = relative(opts.cwd, imagePath)
        if (relPath.startsWith('..')) throw new Error('Design image path escapes working directory')
        const imageData = readFileSync(imagePath).toString('base64')
        const ext = opts.designImagePath.split('.').pop()?.toLowerCase()
        const mediaType =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/png'

        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageData,
          },
        })
      } catch {
        /* image read failed, continue without it */
      }
    }

    // For resume, send a continuation prompt
    const promptText = opts.resumeSessionId
      ? 'Continue where you left off. You ran out of budget but now have more. Keep working on the same task — do NOT restart from scratch.'
      : opts.prompt

    content.push({ type: 'text', text: promptText })

    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    })

    return spawnAgentStreamJson('claude', args, message, opts)
  }

  async isAvailable(): Promise<boolean> {
    return which('claude')
  }

  supportsImages(): boolean {
    return true
  }
}
