import type { PlatformSpec, Runner, ModificationPlan } from '@appifex/core'

export interface GeneratedFile {
  path: string
  content: string
}

export interface CodegenInput {
  spec: PlatformSpec
  uiTestPaths: string[]
  unitTestPaths: string[]
  outputDir: string
  designImagePath?: string
  /** Additional prompt content from skills (injected by the pipeline) */
  skillPrompt?: string
  /** Actual test file contents (so the LLM can generate code that passes them) */
  uiTestContent?: Array<{ path: string; content: string }>
  unitTestContent?: Array<{ path: string; content: string }>
  /** Modification plan for add-feature mode — existing files to modify (D-05) */
  modificationPlan?: ModificationPlan
  /** BaaS context for repository-aware codegen (D-14) — injected by baas_schema pipeline phase */
  baasContext?: import('@appifex/core').BaasContext
  /** When true, auth screens exist and the LLM should style-match them without touching auth wiring (D-01 Pass 2) */
  baasAuthScreens?: boolean
}

export interface CodegenResult {
  success: boolean
  files: GeneratedFile[]
  tokensUsed: number
  error?: string
}

export interface CodegenAdapter {
  name: string
  generate(input: CodegenInput): Promise<CodegenResult>
}
