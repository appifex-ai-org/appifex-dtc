import type { CodegenInput, CodegenResult, GeneratedFile } from '@appifex/codegen'
import type { ValidationResult } from '@appifex/validate'
import type { Runner, DebugLogger } from '@appifex/core'
import { rankFilesByFailureLocality } from '@appifex/analysis'
import { extractJsonObject } from './json-extract.js'

// Device flow constants
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export function buildDeviceFlowUrl(clientId: string): string {
  return GITHUB_DEVICE_CODE_URL
}

export interface DeviceFlowResult {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
}

export async function startDeviceFlow(clientId: string): Promise<DeviceFlowResult> {
  const resp = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'copilot' }),
  })
  const data = (await resp.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval,
  }
}

// Phase 03 (DX-05): honour RFC 8628 §3.5 `slow_down` with an additive
// +5s bump (or server-provided `interval` if larger) and ±15% jitter
// on every sleep. RNG + sleep are injectable for deterministic unit
// tests; production callers supply neither and get Math.random +
// setTimeout. A 1-second minimum clamp defends against a pathological
// `interval=0` server response.

export interface PollForTokenOpts {
  timeoutMs?: number
  /** Injectable RNG — returns a number in [0, 1). Defaults to Math.random. */
  rng?: () => number
  /** Injectable sleep — defaults to a setTimeout-based Promise. */
  sleep?: (ms: number) => Promise<void>
}

const MIN_SLEEP_MS = 1_000
const SLOW_DOWN_BUMP_SECONDS = 5
const JITTER_FRACTION = 0.15

function applyJitter(baseMs: number, rng: () => number): number {
  // rng() ∈ [0,1) → jitter ∈ [-JITTER_FRACTION, +JITTER_FRACTION)
  const jitter = (rng() * 2 - 1) * JITTER_FRACTION
  const jittered = baseMs * (1 + jitter)
  return Math.max(MIN_SLEEP_MS, Math.floor(jittered))
}

export async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  opts: PollForTokenOpts | number = {},
): Promise<string> {
  // Backward-compat: previous signature was
  //   pollForToken(clientId, deviceCode, interval, timeoutMs=300000).
  // If a caller still passes a number as the 4th arg, coerce to opts.
  const parsed: PollForTokenOpts = typeof opts === 'number' ? { timeoutMs: opts } : opts
  const timeoutMs = parsed.timeoutMs ?? 300_000
  const rng = parsed.rng ?? Math.random
  const sleep = parsed.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let currentInterval = interval
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const sleepMs = applyJitter(currentInterval * 1000, rng)
    await sleep(sleepMs)

    const resp = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const data = (await resp.json()) as {
      access_token?: string
      error?: string
      error_description?: string
      interval?: number
    }

    if (data.access_token) return data.access_token
    if (data.error === 'expired_token') throw new Error('Device flow expired')
    if (data.error === 'access_denied') throw new Error('User denied access')
    if (data.error === 'slow_down') {
      // Phase 03 (DX-05): RFC 8628 §3.5 — bump interval by +5s,
      // or use server-provided interval if larger.
      const bumped = currentInterval + SLOW_DOWN_BUMP_SECONDS
      const server = typeof data.interval === 'number' ? data.interval : 0
      currentInterval = Math.max(bumped, server)
    }
    // else 'authorization_pending' or unknown — keep currentInterval
  }
  throw new Error('Device flow timed out')
}

// ── Copilot SDK wrappers ──

interface CopilotClientLike {
  start(): Promise<void>
  stop(): Promise<unknown[]>
  createSession(config: Record<string, unknown>): Promise<CopilotSessionLike>
}

interface CopilotSessionLike {
  sendAndWait(opts: { prompt: string }): Promise<{ data: { content: string } } | undefined>
  disconnect(): Promise<void>
}

export interface CopilotProviderOpts {
  githubToken: string
  model?: string
  createClient?: () => CopilotClientLike
}

function buildCodegenPrompt(input: CodegenInput): string {
  const specJson = JSON.stringify(input.spec, null, 2)
  return `You are a code generation expert. Generate a complete ${input.spec.platform} app based on this design spec.

## Design Spec
${specJson}

## Test Files to Satisfy
UI tests (Maestro): ${input.uiTestPaths.join(', ')}
Unit tests: ${input.unitTestPaths.join(', ')}

## Requirements
- Every component must include the testID from the spec
- Code must pass all UI and unit tests
- Use the design tokens for styling

## Output Format
Respond with ONLY a JSON object:
{ "files": [{ "path": "relative/path.tsx", "content": "full content" }] }`
}

async function createRealClient(githubToken: string): Promise<CopilotClientLike> {
  const { CopilotClient } = await import('@github/copilot-sdk')
  return new CopilotClient({ githubToken, useLoggedInUser: false }) as unknown as CopilotClientLike
}

export function createCopilotGenerateFn(
  opts: CopilotProviderOpts,
): (input: CodegenInput) => Promise<CodegenResult> {
  const model = opts.model ?? 'claude-sonnet-4-6'

  return async (input: CodegenInput): Promise<CodegenResult> => {
    const client = opts.createClient?.() ?? (await createRealClient(opts.githubToken))
    try {
      await client.start()
      const session = await client.createSession({
        model,
        onPermissionRequest: () => ({ allow: true }),
      })

      const response = await session.sendAndWait({ prompt: buildCodegenPrompt(input) })
      const text = response?.data.content ?? ''

      await session.disconnect()
      await client.stop()

      // Phase 03 (DX-02): balanced-brace walker replaces greedy regex
      // that could match prose containing the literal word "files".
      const jsonSpan = extractJsonObject(text)
      if (!jsonSpan) {
        return {
          success: false,
          files: [],
          tokensUsed: 0,
          error: 'Copilot did not return valid JSON with files array',
        }
      }

      const parsed = JSON.parse(jsonSpan) as { files: GeneratedFile[] }
      if (!Array.isArray(parsed.files)) {
        return { success: false, files: [], tokensUsed: 0, error: 'Response missing files array' }
      }

      return { success: true, files: parsed.files, tokensUsed: 0 }
    } catch (err) {
      return {
        success: false,
        files: [],
        tokensUsed: 0,
        error: String(err instanceof Error ? err.message : err),
      }
    }
  }
}

export interface CopilotFixOpts extends CopilotProviderOpts {
  runner: Runner
  projectDir: string
  /** Phase 02 (OBS-01): optional DebugLogger for failure diagnosis. */
  debug?: DebugLogger
}

export function createCopilotFixFn(
  opts: CopilotFixOpts,
): (failures: ValidationResult) => Promise<{ filesChanged: string[]; tokensUsed: number }> {
  const model = opts.model ?? 'claude-sonnet-4-6'

  return async (failures: ValidationResult) => {
    const client = opts.createClient?.() ?? (await createRealClient(opts.githubToken))
    try {
      // Read source files
      const srcFiles = await opts.runner.glob(`${opts.projectDir}/src/**/*.{ts,tsx}`)
      const sourcesFiles = await opts.runner.glob(`${opts.projectDir}/Sources/**/*.swift`)
      const sourceFiles = [...srcFiles, ...sourcesFiles]
      // Phase 04 (DX-08): rank by failure locality before slicing — was blind first-20 glob order.
      const ranked = rankFilesByFailureLocality(sourceFiles, failures)
      const codeChunks: string[] = []
      for (const file of ranked.slice(0, 20)) {
        const content = await opts.runner.readFile(file)
        codeChunks.push(`// ${file}\n${content}`)
      }

      const uiFailures = failures.ui.results
        .filter((r) => !r.passed)
        .map((r) => `- UI: ${r.flowName}: ${r.error}`)
        .join('\n')
      const unitFailures = failures.unit.failures
        .map((f) => `- Unit: ${f.testName}: ${f.error}`)
        .join('\n')

      const prompt = `Fix the following test failures. Only change what's needed.

## Failing Tests
${uiFailures}
${unitFailures}

## Current Code
${codeChunks.join('\n\n')}

## Output Format
Respond with ONLY a JSON object:
{ "fixes": [{ "path": "/full/path.tsx", "content": "full fixed content" }] }`

      await client.start()
      const session = await client.createSession({
        model,
        onPermissionRequest: () => ({ allow: true }),
      })

      const response = await session.sendAndWait({ prompt })
      const text = response?.data.content ?? ''

      await session.disconnect()
      await client.stop()

      // Phase 03 (DX-02): balanced-brace walker replaces greedy regex
      // that could match prose containing the literal word "fixes".
      const jsonSpan = extractJsonObject(text)
      if (!jsonSpan) {
        // Phase 02 (OBS-01): surface instead of silently dropping.
        await opts.debug?.logJson('copilot-fix-error.json', {
          kind: 'copilot-fix-no-json-match',
          preview: text.slice(0, 500),
        })
        return { filesChanged: [], tokensUsed: 0 }
      }

      const parsed = JSON.parse(jsonSpan) as { fixes: Array<{ path: string; content: string }> }
      if (!Array.isArray(parsed.fixes)) {
        // Phase 02 (OBS-01): surface instead of silently dropping.
        await opts.debug?.logJson('copilot-fix-error.json', {
          kind: 'copilot-fix-malformed-fixes',
          raw: jsonSpan.slice(0, 500),
        })
        return { filesChanged: [], tokensUsed: 0 }
      }

      const filesChanged: string[] = []
      for (const fix of parsed.fixes) {
        await opts.runner.writeFile(fix.path, fix.content)
        filesChanged.push(fix.path)
      }

      return { filesChanged, tokensUsed: 0 }
    } catch {
      return { filesChanged: [], tokensUsed: 0 }
    }
  }
}
