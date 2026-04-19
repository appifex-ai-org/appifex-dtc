import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { FigmaMcpClientLike } from '../src/figma-make-adapter.js'

// Phase 04 (SEC-02, T-04-06) — integration tests proving writeBinary() writes
// the exact bytes through Node fs (no shell). The former `sh -c echo '${b64}' |
// base64 -d > '${path}'` was vulnerable to single-quote injection.

/**
 * Test runner that mirrors the real LocalRunner surface for the two calls the
 * adapter makes during readDesign(): `mkdir -p <dir>` via `.exec(...)` and
 * `writeFile(<path>, <content>)` for the HTML artifact. Both physically touch
 * the temp filesystem so the subsequent writeBinary() call can land the PNG
 * into an existing directory.
 */
function mockRunner() {
  return {
    exec: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'mkdir' && args[0] === '-p') {
        mkdirSync(args[1], { recursive: true })
      }
      return { exitCode: 0, stdout: '', stderr: '', duration: 0 }
    }),
    writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
      writeFileSync(path, content)
    }),
    readFile: vi.fn().mockResolvedValue(''),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
  }
}

function mockMcpClient(binaryContent: Buffer): FigmaMcpClientLike {
  return {
    getDesignContext: vi.fn().mockResolvedValue({
      code: '<html>hello</html>',
      metadata: {},
      screenNames: ['Home'],
    }),
    getScreenshot: vi.fn().mockResolvedValue(binaryContent),
  }
}

describe('FigmaMakeAdapter.writeBinary — shell-free binary write (SEC-02)', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dtc-figma-binwrite-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  async function createAdapter(
    runner: ReturnType<typeof mockRunner>,
    mcpClient: FigmaMcpClientLike,
  ) {
    const { FigmaMakeAdapter } = await import('../src/figma-make-adapter.js')
    return new FigmaMakeAdapter(runner as unknown as import('@appifex/core').Runner, {
      figmaToken: 'figd_test',
      figmaFileUrl: 'https://www.figma.com/design/abc123/TestDesign',
      mcpClient,
    })
  }

  it('writes binary bytes (0x00-0xFF) byte-identical to the input Buffer', async () => {
    // Full byte range — includes 0x00, quotes, backslashes, newlines, all the
    // characters that would have broken a single-quoted shell command.
    const bytes = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) bytes[i] = i

    const runner = mockRunner()
    const mcpClient = mockMcpClient(bytes)
    const adapter = await createAdapter(runner, mcpClient)

    const outputDir = join(workDir, 'figma-out')
    const result = await adapter.create({ outputDir })

    expect(result.success).toBe(true)
    const pngPath = join(outputDir, '.figma-make', 'screen-0.png')
    expect(existsSync(pngPath)).toBe(true)

    const roundTrip = readFileSync(pngPath)
    expect(roundTrip.length).toBe(256)
    // Compare every byte — ANY base64-via-shell path would have mangled 0x00
    // or newlines (which are interpreted by echo).
    expect(Buffer.compare(roundTrip, bytes)).toBe(0)
  })

  it('treats path containing shell metacharacters as a literal filename', async () => {
    // Path with `;` — under the old `sh -c ... > '${path}'` code, the `;`
    // inside single quotes would not have been a command separator BUT the
    // quoting logic was fragile and would break on embedded single quotes.
    // Under the new fs.writeFile path, the filename is just a string — no
    // parsing at all.
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes

    const runner = mockRunner()
    const mcpClient = mockMcpClient(bytes)
    const adapter = await createAdapter(runner, mcpClient)

    const outputDir = join(workDir, 'figma-out')
    const previewPath = join(workDir, 'preview;literal.png')
    const result = await adapter.create({ outputDir, previewPath })

    expect(result.success).toBe(true)
    // The literal filename including `;` exists; no `literal.png` was created
    // separately (which would indicate shell misinterpretation).
    expect(existsSync(previewPath)).toBe(true)
    expect(existsSync(join(workDir, 'literal.png'))).toBe(false)

    const roundTrip = readFileSync(previewPath)
    expect(Buffer.compare(roundTrip, bytes)).toBe(0)
  })

  it('never calls runner.exec with a "sh" command — shell path fully removed', async () => {
    const bytes = Buffer.from([0x01, 0x02, 0x03])

    const runner = mockRunner()
    const mcpClient = mockMcpClient(bytes)
    const adapter = await createAdapter(runner, mcpClient)

    const outputDir = join(workDir, 'figma-out')
    await adapter.create({ outputDir })

    // The only runner.exec call should be the `mkdir -p` in readDesign — no
    // `sh -c ... base64 -d` call for the binary write path.
    const shCalls = runner.exec.mock.calls.filter(([cmd]) => cmd === 'sh')
    expect(shCalls).toHaveLength(0)
  })
})
