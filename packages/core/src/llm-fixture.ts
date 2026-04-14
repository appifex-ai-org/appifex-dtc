// Phase 1 Plan 01-10 (GATE-02): fixture-replay for hermetic CI.
// When DTC_LLM_MODE=fixture, every LLM entry point short-circuits to a
// committed cassette under fixtures/tiny-mock/llm-fixtures/. No network,
// no tokens. Missing cassette throws — never silently falls through.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export class FixtureModeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixtureModeError'
  }
}

export function isFixtureMode(): boolean {
  return process.env.DTC_LLM_MODE === 'fixture'
}

/**
 * Resolve the llm-fixtures directory. Order:
 *   1. DTC_LLM_FIXTURES_DIR (explicit override, used by tests)
 *   2. <cwd>/fixtures/tiny-mock/llm-fixtures (default for the tiny-mock pipeline)
 */
function fixturesDir(): string {
  const override = process.env.DTC_LLM_FIXTURES_DIR
  if (override) return override
  return join(process.cwd(), 'fixtures', 'tiny-mock', 'llm-fixtures')
}

export interface FixtureResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

/**
 * Load the cassette for `key` (e.g. "baas-schema", "codegen", "fix").
 * Cassette shape on disk is `FixtureResponse` JSON.
 * Throws FixtureModeError with an actionable message if the file is missing.
 */
export function loadFixture(key: string): FixtureResponse {
  const dir = fixturesDir()
  const path = join(dir, `${key}.json`)
  if (!existsSync(path)) {
    throw new FixtureModeError(
      `DTC_LLM_MODE=fixture but no cassette at ${path}. ` +
        `Add the canned response for "${key}" to fixtures/tiny-mock/llm-fixtures/ ` +
        `or unset DTC_LLM_MODE. Override dir via DTC_LLM_FIXTURES_DIR.`,
    )
  }
  const raw = readFileSync(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new FixtureModeError(
      `DTC_LLM_MODE=fixture cassette ${path} is not valid JSON: ${String(err)}`,
    )
  }
  const p = parsed as Partial<FixtureResponse>
  if (!p || !Array.isArray(p.content) || !p.usage) {
    throw new FixtureModeError(
      `DTC_LLM_MODE=fixture cassette ${path} has wrong shape. ` +
        `Expected { content: [{ type, text }], usage: { input_tokens, output_tokens } }.`,
    )
  }
  return p as FixtureResponse
}
