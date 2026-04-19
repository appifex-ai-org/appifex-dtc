// Phase 04 (DX-07): shared CreateMessageFn contract consumed by all
// provider-message factories and by pipeline.ts::buildCreateMessageFn.
// Shape locked at pipeline.ts HEAD so extracted factories are drop-in.

export interface CreateMessageParams {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: any }>
}

export interface CreateMessageResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export type CreateMessageFn = (params: CreateMessageParams) => Promise<CreateMessageResponse>
