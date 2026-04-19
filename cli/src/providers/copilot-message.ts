// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:825-864 per REQUIREMENTS.md.
// Factory for the `copilot` provider — wraps @github/copilot-sdk. Mirrors the
// `CopilotClientLike` + `createRealClient` pattern already established in
// cli/src/providers/copilot.ts:119-162. The single SDK-boundary cast to
// `CopilotClientLike` is funnelled through a dedicated helper so the factory
// body remains typed with zero `as any` leaks.
//
// Precondition (enforced by pipeline.ts dispatch): cfg.llm.githubToken is
// defined when this factory is called — the dispatch guard `cfg.llm.provider
// === 'copilot' && cfg.llm.githubToken` in buildCreateMessageFn ensures this.

import type { DtcConfig } from '@appifex/core'
import type { CreateMessageFn } from './message-types.js'

interface CopilotSessionLike {
  sendAndWait(input: { prompt: string }): Promise<{ data?: { content?: string } } | undefined>
  disconnect(): Promise<void>
}

interface CopilotClientLike {
  start(): Promise<void>
  createSession(opts: {
    model: string
    onPermissionRequest: () => { allow: boolean }
  }): Promise<CopilotSessionLike>
  stop(): Promise<unknown>
}

async function createRealClient(githubToken: string): Promise<CopilotClientLike> {
  const { CopilotClient } = await import('@github/copilot-sdk')
  return new CopilotClient({
    githubToken,
    useLoggedInUser: false,
  }) as unknown as CopilotClientLike
}

export async function createCopilotMessageFn(cfg: DtcConfig): Promise<CreateMessageFn> {
  return async (params) => {
    // Serialize all messages into a single prompt so Copilot sees full context
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

    // Precondition from pipeline.ts dispatch guard — non-null assertion is safe.
    const client = await createRealClient(cfg.llm.githubToken!)
    await client.start()
    try {
      const session = await client.createSession({
        model: cfg.llm.model ?? 'claude-sonnet-4-6',
        onPermissionRequest: () => ({ allow: true }),
      })
      const resp = await session.sendAndWait({ prompt })
      const text = resp?.data?.content ?? ''
      await session.disconnect()
      return {
        content: [{ type: 'text', text }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }
    } finally {
      await client.stop()
    }
  }
}
