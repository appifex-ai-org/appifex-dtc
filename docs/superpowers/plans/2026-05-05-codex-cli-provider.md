# Codex CLI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `codex-cli` as a text-only local LLM provider that uses the installed and authenticated `codex` command without storing an API key.

**Architecture:** Keep `llm.provider = codex-cli` separate from the existing `agent.type = codex` agent mode. The LLM provider path serializes existing message arrays into text, calls `codex exec` non-interactively, reads the final answer via `--output-last-message`, and returns the existing `{ content, usage }` shape. Fixture mode remains the first branch and short-circuits before Codex CLI.

**Tech Stack:** TypeScript ESM, pnpm monorepo, Vitest, Node child_process spawn, existing `@appifex/core` config/prerequisite/credential utilities, existing CLI setup flow using `@clack/prompts`.

---

## File Structure

- `packages/core/src/types-config.ts`: extend `LlmConfig.provider` with `codex-cli`.
- `packages/core/src/prerequisites.ts`: make shallow LLM prerequisite checks pass/fail on `codex` binary when `provider === 'codex-cli'`.
- `packages/core/src/credential-registry.ts`: make credential preflight skip API-key checks for `codex-cli`.
- `packages/core/__tests__/prerequisites.test.ts`: add fixture and Codex CLI prerequisite coverage.
- `packages/core/__tests__/credential-registry.test.ts`: add Codex CLI credential-gate coverage.
- `cli/src/setup/llm.ts`: add setup option and model choices for `codex-cli`; store empty API key.
- `cli/src/doctor.ts`: do not warn about missing API key for `codex-cli`.
- `cli/src/pipeline.ts`: export `serializeMessagesForCli` and `runCodexCli`; add `codex-cli` provider branch in `buildCreateMessageFn`.
- `cli/__tests__/setup-sections.test.ts`: verify setup stores `apiKey: ""` for `codex-cli`.
- `cli/__tests__/pipeline-codex-cli.test.ts`: new test file for prompt serialization and `runCodexCli` process handling.

---

### Task 1: Config And Setup UX

**Files:**
- Modify: `packages/core/src/types-config.ts`
- Modify: `cli/src/setup/llm.ts`
- Test: `cli/__tests__/setup-sections.test.ts`

- [ ] **Step 1: Write the failing setup test**

Append this test inside the existing `describe('runLlmSection', () => { ... })` block in `cli/__tests__/setup-sections.test.ts`:

```ts
  it('stores empty apiKey when Codex CLI provider is selected', async () => {
    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-old', model: 'claude-3' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    const clack = await import('@clack/prompts')
    vi.mocked(clack.select)
      .mockResolvedValueOnce('codex-cli')
      .mockResolvedValueOnce('gpt-5.1-codex')

    const { runLlmSection } = await import('../src/setup/llm.js')
    const existingConfig = await loadConfig(configDir)
    await runLlmSection(configDir, existingConfig)

    const updatedConfig = await loadConfig(configDir)
    expect(updatedConfig.llm.provider).toBe('codex-cli')
    expect(updatedConfig.llm.apiKey).toBe('')
    expect(updatedConfig.llm.model).toBe('gpt-5.1-codex')
    expect(clack.password).not.toHaveBeenCalled()
    expect(clack.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Using local Codex CLI'),
    )
  })
```

- [ ] **Step 2: Run the focused setup test and verify it fails**

Run:

```bash
pnpm vitest run cli/__tests__/setup-sections.test.ts -t "Codex CLI"
```

Expected: FAIL because `codex-cli` is not an allowed provider type and the setup flow currently treats it like an API-key provider.

- [ ] **Step 3: Extend the LLM provider type**

Update `packages/core/src/types-config.ts`:

```ts
export interface LlmConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'copilot' | 'claude-cli' | 'codex-cli'
  apiKey: string
  githubToken?: string
  model?: string
  fastModel?: string
}
```

- [ ] **Step 4: Add Codex CLI model choices and setup branch**

In `cli/src/setup/llm.ts`, add this entry to `MODEL_OPTIONS` after `'claude-cli'`:

```ts
  'codex-cli': [
    {
      value: 'gpt-5.1-codex',
      label: 'GPT-5.1 Codex',
      hint: 'recommended',
    },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', hint: 'faster' },
  ],
```

Add this option to the `LLM provider` select options after Claude Code:

```ts
      {
        value: 'codex-cli',
        label: 'Codex CLI (local auth)',
        hint: 'uses your local `codex` - no API key stored',
      },
```

Change the provider-specific branch to include Codex CLI:

```ts
  } else if (provider === 'claude-cli') {
    p.log.info('Using local Claude Code CLI - make sure `claude` is installed and authenticated.')
    apiKey = ''
  } else if (provider === 'codex-cli') {
    p.log.info(
      'Using local Codex CLI - make sure `codex` is installed and authenticated with `codex --login` or OPENAI_API_KEY.',
    )
    apiKey = ''
  } else {
```

- [ ] **Step 5: Run setup test and typecheck the touched packages**

Run:

```bash
pnpm vitest run cli/__tests__/setup-sections.test.ts -t "Codex CLI"
pnpm --filter @appifex/core exec tsc --noEmit
pnpm --filter @appifex/cli exec tsc --noEmit
```

Expected: all commands PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/core/src/types-config.ts cli/src/setup/llm.ts cli/__tests__/setup-sections.test.ts
git commit -m "feat(setup): add codex cli llm option"
```

---

### Task 2: Preflight, Credentials, And Doctor Behavior

**Files:**
- Modify: `packages/core/src/prerequisites.ts`
- Modify: `packages/core/src/credential-registry.ts`
- Modify: `cli/src/doctor.ts`
- Test: `packages/core/__tests__/prerequisites.test.ts`
- Test: `packages/core/__tests__/credential-registry.test.ts`

- [ ] **Step 1: Write failing prerequisite tests**

Append these tests inside `describe('checkCriticalPrerequisites — LLM access under fixture mode', () => { ... })` in `packages/core/__tests__/prerequisites.test.ts`:

```ts
  it('fixture short-circuit wins over the codex-cli provider branch', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const cfg: DtcConfig = {
      llm: { provider: 'codex-cli', apiKey: '' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('kotlin-compose', cfg)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })

  it('codex-cli provider checks local codex binary instead of apiKey', () => {
    const cfg: DtcConfig = {
      llm: { provider: 'codex-cli', apiKey: '' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('kotlin-compose', cfg)
    const llm = findLlmCheck(report)
    expect(['pass', 'fail']).toContain(llm.status)
    expect(llm.message).toMatch(/Codex CLI available|codex CLI not found/)
    expect(llm.message).not.toMatch(/API key/)
  })
```

- [ ] **Step 2: Write failing credential-registry tests**

Append these tests before the closing `})` of `packages/core/__tests__/credential-registry.test.ts`:

```ts
  it('codex-cli shallow LLM probe returns OK without apiKey', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'codex-cli' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig

    const report = await runCredentialChecks(config, { deep: false })
    const llmCheck = report.checks.find((c) => c.name === 'llm')

    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('OK')
    expect(llmCheck!.message).toBe('codex-cli (local auth)')
    expect(report.hasBlockingFailures).toBe(false)
  })

  it('codex-cli deep LLM probe skips API ping and returns OK', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'codex-cli' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig

    const report = await runCredentialChecks(config, { deep: true })
    const llmCheck = report.checks.find((c) => c.name === 'llm')

    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('OK')
    expect(llmCheck!.message).toBe('codex-cli (local auth)')
    expect(report.hasBlockingFailures).toBe(false)
  })
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
pnpm vitest run packages/core/__tests__/prerequisites.test.ts -t "codex-cli"
pnpm vitest run packages/core/__tests__/credential-registry.test.ts -t "codex-cli"
```

Expected: FAIL because `codex-cli` still falls through to API-key checks.

- [ ] **Step 4: Update shallow prerequisite logic**

In `packages/core/src/prerequisites.ts`, add a branch after the existing `claude-cli` branch:

```ts
  if (provider === 'codex-cli') {
    const has = which('codex')
    return {
      name: 'LLM access',
      description: 'AI model for code generation',
      severity: 'critical',
      status: has ? 'pass' : 'fail',
      message: has ? 'Codex CLI available' : 'codex CLI not found',
      installHint: 'Install Codex CLI and run `codex --login`.',
    }
  }
```

- [ ] **Step 5: Update credential LLM probe**

In `packages/core/src/credential-registry.ts`, add this branch immediately after `const key = config?.llm?.apiKey`:

```ts
  if (config?.llm?.provider === 'codex-cli') {
    return {
      ...base,
      status: 'OK',
      message: 'codex-cli (local auth)',
      remedy: undefined,
    }
  }
```

- [ ] **Step 6: Update doctor missing-key warning**

In `cli/src/doctor.ts`, update the condition around lines 83-85 so Codex CLI is excluded:

```ts
    if (
      !config.llm.apiKey &&
      config.llm.provider !== 'claude-cli' &&
      config.llm.provider !== 'codex-cli' &&
      config.llm.provider !== 'copilot'
    ) {
```

- [ ] **Step 7: Run focused tests and typechecks**

Run:

```bash
pnpm vitest run packages/core/__tests__/prerequisites.test.ts -t "codex-cli"
pnpm vitest run packages/core/__tests__/credential-registry.test.ts -t "codex-cli"
pnpm --filter @appifex/core exec tsc --noEmit
pnpm --filter @appifex/cli exec tsc --noEmit
```

Expected: all commands PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add packages/core/src/prerequisites.ts packages/core/src/credential-registry.ts cli/src/doctor.ts packages/core/__tests__/prerequisites.test.ts packages/core/__tests__/credential-registry.test.ts
git commit -m "feat(core): accept codex cli local auth"
```

---

### Task 3: Codex CLI Helper And Serialization

**Files:**
- Modify: `cli/src/pipeline.ts`
- Create: `cli/__tests__/pipeline-codex-cli.test.ts`

- [ ] **Step 1: Create failing tests for serialization and success path**

Create `cli/__tests__/pipeline-codex-cli.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EpipeError, CliError } from '@appifex/core'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const pipelineModule: {
  serializeMessagesForCli?: (
    messages: Array<{ role: string; content: unknown }>,
  ) => { prompt: string; omittedImageCount: number }
  runCodexCli?: (opts: { prompt: string; model: string; cwd: string }) => Promise<{
    content: Array<{ type: string; text: string }>
    usage: { input_tokens: number; output_tokens: number }
  }>
} = await import('../src/pipeline.js')

function makeFakeChild(opts: {
  code: number
  stdout?: string
  stderr?: string
  onWrite?: () => void
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  const stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: (_chunk: unknown) => {
      opts.onWrite?.()
      return true
    },
    end: () => {
      setImmediate(() => {
        if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout))
        if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr))
        child.emit('close', opts.code)
      })
    },
  } as unknown as Writable
  child.stdin = stdin
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function makeFakeChildEmittingEpipeOnStdin() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  const stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: (_chunk: unknown) => {
      setImmediate(() => {
        const err = new Error('write EPIPE') as NodeJS.ErrnoException
        err.code = 'EPIPE'
        stdinEmitter.emit('error', err)
        setImmediate(() => child.emit('close', 0))
      })
      return true
    },
    end: () => {},
  } as unknown as Writable
  child.stdin = stdin
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('serializeMessagesForCli', () => {
  it('serializes string and text-array content while counting omitted images', () => {
    expect(typeof pipelineModule.serializeMessagesForCli).toBe('function')

    const result = pipelineModule.serializeMessagesForCli!([
      { role: 'system', content: 'System prompt' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Build this app' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ],
      },
      { role: 'assistant', content: 42 },
    ])

    expect(result.prompt).toContain('System prompt')
    expect(result.prompt).toContain('Build this app')
    expect(result.prompt).toContain('42')
    expect(result.prompt).not.toContain('base64,abc')
    expect(result.omittedImageCount).toBe(1)
  })
})

describe('runCodexCli', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-codex-test-'))
    vi.mocked(spawn).mockReset()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns final answer from --output-last-message file', async () => {
    expect(typeof pipelineModule.runCodexCli).toBe('function')

    vi.mocked(spawn).mockImplementation(((_binary: string, args: string[]) => {
      const outIndex = args.indexOf('--output-last-message')
      const outPath = args[outIndex + 1]
      writeFileSync(outPath, 'final answer from codex')
      return makeFakeChild({ code: 0, stdout: 'progress output' })
    }) as any)

    const result = await pipelineModule.runCodexCli!({
      prompt: 'Say hi',
      model: 'gpt-5.1-codex',
      cwd: tmpDir,
    })

    expect(result.content).toEqual([{ type: 'text', text: 'final answer from codex' }])
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 })
    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining([
        'exec',
        '--model',
        'gpt-5.1-codex',
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'never',
        '--output-last-message',
        expect.any(String),
        '-',
      ]),
      expect.objectContaining({ cwd: tmpDir }),
    )
  })
})
```

- [ ] **Step 2: Run new tests and verify they fail**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts
```

Expected: FAIL because `serializeMessagesForCli` and `runCodexCli` are not exported yet.

- [ ] **Step 3: Add serialization helper**

In `cli/src/pipeline.ts`, add this exported helper near `runClaudePrint`:

```ts
export function serializeMessagesForCli(
  messages: Array<{ role: string; content: unknown }>,
): { prompt: string; omittedImageCount: number } {
  let omittedImageCount = 0
  const sections = messages.map((message) => {
    let text = ''
    if (typeof message.content === 'string') {
      text = message.content
    } else if (Array.isArray(message.content)) {
      const parts: string[] = []
      for (const part of message.content) {
        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          (part as { type?: unknown }).type === 'text' &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          parts.push((part as { text: string }).text)
        } else if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          (part as { type?: unknown }).type === 'image_url'
        ) {
          omittedImageCount += 1
        }
      }
      text = parts.join('\n')
    } else {
      text = String(message.content)
    }
    return `## ${message.role}\n\n${text}`
  })

  const omittedNote =
    omittedImageCount > 0
      ? `\n\n[dtc note: omitted ${omittedImageCount} image part(s); codex-cli provider is text-only in this release.]`
      : ''

  return { prompt: sections.join('\n\n') + omittedNote, omittedImageCount }
}
```

- [ ] **Step 4: Add `runCodexCli` helper**

In `cli/src/pipeline.ts`, add this exported helper after `serializeMessagesForCli`:

```ts
interface RunCodexCliOpts {
  prompt: string
  model: string
  cwd: string
}

export async function runCodexCli(opts: RunCodexCliOpts): Promise<{
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}> {
  const { spawn } = await import('node:child_process')
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { prompt, model, cwd } = opts
  const payloadBytes = Buffer.byteLength(prompt, 'utf8')
  const tmpDir = await mkdtemp(join(tmpdir(), 'dtc-codex-cli-'))
  const outputPath = join(tmpDir, 'last-message.txt')

  try {
    return await new Promise<{
      content: Array<{ type: string; text: string }>
      usage: { input_tokens: number; output_tokens: number }
    }>((resolve, reject) => {
      const child = spawn(
        'codex',
        [
          'exec',
          '--model',
          model,
          '--sandbox',
          'read-only',
          '--ask-for-approval',
          'never',
          '--skip-git-repo-check',
          '--color',
          'never',
          '--output-last-message',
          outputPath,
          '-',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd,
        },
      )

      let settled = false
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          fn()
        }
      }

      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          settle(() =>
            reject(
              new EpipeError(
                `LLM CLI closed stdin before prompt fully written (site=cli/pipeline.ts:codex-cli, ${payloadBytes} bytes)`,
                'cli/pipeline.ts:codex-cli',
                payloadBytes,
              ),
            ),
          )
          return
        }
        child.kill('SIGTERM')
        settle(() => reject(err))
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
      child.on('error', (err) => {
        settle(() => reject(err))
      })
      child.on('close', async (code) => {
        if (code !== 0) {
          settle(() =>
            reject(
              new Error(
                `codex exec exited with code ${code}${stderr ? `\nstderr: ${stderr}` : ''}${stdout ? `\nstdout preview: ${stdout.slice(0, 200)}` : ''}\nInstall Codex CLI and run \`codex --login\`.`,
              ),
            ),
          )
          return
        }

        try {
          const text = (await readFile(outputPath, 'utf8')).trim()
          if (!text) {
            settle(() =>
              reject(
                new Error(
                  `codex exec returned empty response${stderr ? `\nstderr: ${stderr}` : ''}`,
                ),
              ),
            )
            return
          }
          settle(() =>
            resolve({
              content: [{ type: 'text', text }],
              usage: { input_tokens: 0, output_tokens: 0 },
            }),
          )
        } catch (err) {
          settle(() =>
            reject(
              new Error(
                `codex exec did not write final response: ${err instanceof Error ? err.message : String(err)}`,
              ),
            ),
          )
        }
      })
    })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
```

- [ ] **Step 5: Confirm `EpipeError` import**

At the top of `cli/src/pipeline.ts`, confirm the existing `@appifex/core` import includes `EpipeError` as a value import. The current import already contains this entry:

```ts
import {
  EpipeError,
} from '@appifex/core'
```

Expected: no import edit is needed unless the file changed before this task runs.

- [ ] **Step 6: Run helper tests**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts
pnpm --filter @appifex/cli exec tsc --noEmit
```

Expected: tests and typecheck PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add cli/src/pipeline.ts cli/__tests__/pipeline-codex-cli.test.ts
git commit -m "feat(cli): add codex cli runner helper"
```

---

### Task 4: Codex CLI Failure Handling

**Files:**
- Modify: `cli/__tests__/pipeline-codex-cli.test.ts`
- Modify: `cli/src/pipeline.ts`

- [ ] **Step 1: Add failure tests**

Append these tests inside the existing `describe('runCodexCli', () => { ... })` block in `cli/__tests__/pipeline-codex-cli.test.ts`:

```ts
  it('rejects when codex exits non-zero', async () => {
    vi.mocked(spawn).mockImplementation((() =>
      makeFakeChild({ code: 2, stderr: 'not authenticated', stdout: 'partial progress' })) as any)

    await expect(
      pipelineModule.runCodexCli!({
        prompt: 'Say hi',
        model: 'gpt-5.1-codex',
        cwd: tmpDir,
      }),
    ).rejects.toThrow(/codex exec exited with code 2/)
  })

  it('rejects when codex writes an empty final response', async () => {
    vi.mocked(spawn).mockImplementation(((_binary: string, args: string[]) => {
      const outIndex = args.indexOf('--output-last-message')
      const outPath = args[outIndex + 1]
      writeFileSync(outPath, '')
      return makeFakeChild({ code: 0, stderr: 'empty final message' })
    }) as any)

    await expect(
      pipelineModule.runCodexCli!({
        prompt: 'Say hi',
        model: 'gpt-5.1-codex',
        cwd: tmpDir,
      }),
    ).rejects.toThrow(/codex exec returned empty response/)
  })

  it('rejects with EpipeError when stdin emits EPIPE', async () => {
    vi.mocked(spawn).mockImplementation((() => makeFakeChildEmittingEpipeOnStdin()) as any)

    const prompt = 'x'.repeat(100_000)
    const expectedBytes = Buffer.byteLength(prompt, 'utf8')

    try {
      await pipelineModule.runCodexCli!({
        prompt,
        model: 'gpt-5.1-codex',
        cwd: tmpDir,
      })
      throw new Error('expected runCodexCli to reject')
    } catch (err) {
      expect(err).toBeInstanceOf(EpipeError)
      expect(err).toBeInstanceOf(CliError)
      const epipe = err as EpipeError
      expect(epipe.site).toBe('cli/pipeline.ts:codex-cli')
      expect(epipe.payloadBytes).toBe(expectedBytes)
      expect(epipe.name).toBe('EpipeError')
    }
  })
```

- [ ] **Step 2: Run failure tests**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts -t "rejects"
```

Expected: PASS if Task 3 implementation already covers these cases. If any fail, adjust only `runCodexCli` error handling to match the test expectations.

- [ ] **Step 3: Run all Codex CLI helper tests and typecheck**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts
pnpm --filter @appifex/cli exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit Task 4**

```bash
git add cli/src/pipeline.ts cli/__tests__/pipeline-codex-cli.test.ts
git commit -m "test(cli): cover codex cli failures"
```

---

### Task 5: Pipeline Provider Routing

**Files:**
- Modify: `cli/src/pipeline.ts`
- Test: `cli/__tests__/pipeline-codex-cli.test.ts`

- [ ] **Step 1: Add routing source guard test**

Append this `describe` block to `cli/__tests__/pipeline-codex-cli.test.ts`:

```ts
describe('pipeline codex-cli provider routing', () => {
  it('buildCreateMessageFn branches to runCodexCli for codex-cli provider', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')

    const src = readFileSync(join(process.cwd(), 'cli/src/pipeline.ts'), 'utf8')

    expect(src).toContain("cfg.llm.provider === 'codex-cli'")
    expect(src).toContain('serializeMessagesForCli(params.messages)')
    expect(src).toContain('return runCodexCli({ prompt, model, cwd: outputDir })')
  })
})
```

- [ ] **Step 2: Run routing test and verify it fails**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts -t "provider routing"
```

Expected: FAIL because `buildCreateMessageFn` does not yet branch on `codex-cli`.

- [ ] **Step 3: Add the provider branch**

In `cli/src/pipeline.ts`, add this branch in `buildCreateMessageFn` immediately after the `claude-cli` branch and before Copilot:

```ts
    if (cfg.llm.provider === 'codex-cli') {
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        const { prompt, omittedImageCount } = serializeMessagesForCli(params.messages)
        if (omittedImageCount > 0) {
          await debug.log(
            'codex-cli-omitted-images.txt',
            `Omitted ${omittedImageCount} image part(s); codex-cli provider is text-only in this release.`,
          )
        }
        const model = cfg.llm.model ?? 'gpt-5.1-codex'
        return runCodexCli({ prompt, model, cwd: outputDir })
      }
    }
```

- [ ] **Step 4: Run routing and helper tests**

Run:

```bash
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts
pnpm --filter @appifex/cli exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add cli/src/pipeline.ts cli/__tests__/pipeline-codex-cli.test.ts
git commit -m "feat(cli): route llm calls through codex cli"
```

---

### Task 6: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
pnpm vitest run cli/__tests__/setup-sections.test.ts -t "Codex CLI"
pnpm vitest run packages/core/__tests__/prerequisites.test.ts -t "codex-cli"
pnpm vitest run packages/core/__tests__/credential-registry.test.ts -t "codex-cli"
pnpm vitest run cli/__tests__/pipeline-codex-cli.test.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Run broader package checks**

Run:

```bash
pnpm --filter @appifex/core exec tsc --noEmit
pnpm --filter @appifex/cli exec tsc --noEmit
pnpm vitest run packages/core/__tests__/credential-registry.test.ts packages/core/__tests__/prerequisites.test.ts cli/__tests__/setup-sections.test.ts cli/__tests__/pipeline-codex-cli.test.ts
```

Expected: all commands PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only intentional tracked changes are present. Existing unrelated untracked files such as `.pnpm-store/`, `.worktrees/`, or `AGENTS.md` may still appear and should not be added.

- [ ] **Step 4: Commit verification-only changes if any**

If a test-driven cleanup changed files, commit them:

```bash
git add cli/src/pipeline.ts cli/src/setup/llm.ts cli/src/doctor.ts cli/__tests__/pipeline-codex-cli.test.ts cli/__tests__/setup-sections.test.ts packages/core/src/types-config.ts packages/core/src/prerequisites.ts packages/core/src/credential-registry.ts packages/core/__tests__/prerequisites.test.ts packages/core/__tests__/credential-registry.test.ts
git commit -m "chore: verify codex cli provider"
```

Expected: if there are no tracked changes, skip this commit.
