// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:759-823 per REQUIREMENTS.md.
// Factory for the `claude-cli` provider — spawns `claude --print` as a subprocess
// and pipes serialised messages into stdin, returning stdout as a
// CreateMessageResponse. The stdin EPIPE handler delegates to the neutral
// `logClaudeStdinError` helper in ../debug-helpers.js (single source of truth;
// Phase 02 OBS-01 contract).

import type { DebugLogger, DtcConfig } from '@appifex/core'
import { logClaudeStdinError } from '../debug-helpers.js'
import type { CreateMessageFn } from './message-types.js'

export async function createClaudeCliMessageFn(
  cfg: DtcConfig,
  opts: { debug: DebugLogger; outputDir: string },
): Promise<CreateMessageFn> {
  const { debug, outputDir } = opts
  const { spawn } = await import('node:child_process')
  return async (params) => {
    const prompt = params.messages
      .map((m) => {
        if (typeof m.content === 'string') return m.content
        if (Array.isArray(m.content))
          return m.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n')
        return String(m.content)
      })
      .join('\n\n')

    const model = cfg.llm.model ?? 'claude-sonnet-4-6'
    return new Promise<{
      content: Array<{ type: string; text: string }>
      usage: { input_tokens: number; output_tokens: number }
    }>((resolve, reject) => {
      const child = spawn('claude', ['--print', '--model', model], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: outputDir,
      })
      // Phase 02 (OBS-01): surface EPIPE instead of swallowing it silently.
      // Handler is sync — must not block the stream, so fire-and-forget.
      child.stdin.on('error', (err) => {
        void logClaudeStdinError(debug, err)
      })
      child.stdin.write(prompt)
      child.stdin.end()
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      child.on('close', (code) => {
        if (code !== 0)
          reject(
            new Error(
              `claude --print exited with code ${code}${stderr ? `\nstderr: ${stderr}` : ''}${stdout ? `\nstdout preview: ${stdout.slice(0, 200)}` : ''}`,
            ),
          )
        else if (!stdout.trim())
          reject(
            new Error(
              `claude --print returned empty response${stderr ? `\nstderr: ${stderr}` : ''}`,
            ),
          )
        else
          resolve({
            content: [{ type: 'text', text: stdout }],
            usage: { input_tokens: 0, output_tokens: 0 },
          })
      })
    })
  }
}
