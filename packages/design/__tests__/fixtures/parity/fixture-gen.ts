#!/usr/bin/env tsx
/**
 * Phase 7 (DESIGN-04 D-03): One-shot parity fixture derivation script.
 *
 * READS: packages/design/__tests__/fixtures/parity/reference.pen (Pencil-authored)
 * WRITES (extractor-input layer — revision B-02):
 *   - stitch.zip      (HTML + PNG stub per screen; Stitch extractor input)
 *   - figma-rest.json (FigmaFileResponse shape; Figma-REST extractor input)
 *   - figma-make.json (FigmaDesignContext shape; Figma-Make extractor input)
 *
 * Run manually: `tsx packages/design/__tests__/fixtures/parity/fixture-gen.ts`
 *
 * NOTE: reference.pen is a plain JSON file — no live Pencil MCP connection needed
 * to re-derive the three wire-format fixtures. Re-run this script whenever
 * reference.pen changes and commit the updated derived fixtures alongside it.
 *
 * NOT included in vitest test glob — filename intentionally lacks `.test.ts`.
 * (Pitfall 6 from 07-RESEARCH.md: test files must not connect to external services.)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const HERE = dirname(fileURLToPath(import.meta.url))
const PEN_PATH = join(HERE, 'reference.pen')

interface PenNode {
  type: string
  id?: string
  name?: string
  children?: PenNode[]
}

interface PenDocument {
  version: string
  children: PenNode[]
  variables?: Record<string, { type: string; value?: string | number }>
}

async function main(): Promise<void> {
  // ---- Read reference.pen (plain JSON fixture) ----
  const penJson = await readFile(PEN_PATH, 'utf-8')
  const pen = JSON.parse(penJson) as PenDocument

  const frames = pen.children.filter((c) => c.type === 'frame')
  if (frames.length === 0) {
    throw new Error('reference.pen has no top-level frames')
  }

  console.log(`Found ${frames.length} screens: ${frames.map((f) => f.name ?? '?').join(', ')}`)

  // ---- Emit figma-rest.json (FigmaFileResponse shape) ----
  // This is the raw IR the figma-rest extractor/client parses.
  // See packages/design/src/figma-rest-client.ts:133-148 for FigmaFileResponse shape.
  const figmaRest = {
    name: 'Parity Reference',
    lastModified: new Date().toISOString(),
    version: '1',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: frames.map((frame, i) => ({
        id: `${i + 1}:0`,
        name: frame.name ?? `Screen ${i}`,
        type: 'CANVAS',
        children: [
          {
            id: `${i + 1}:1`,
            name: frame.name ?? `Screen ${i}`,
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 844 },
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
            children: [],
          },
        ],
      })),
    },
  }
  await writeFile(join(HERE, 'figma-rest.json'), JSON.stringify(figmaRest, null, 2))
  console.log('  -> figma-rest.json (FigmaFileResponse shape)')

  // ---- Emit figma-make.json (FigmaDesignContext shape) ----
  // See packages/design/src/figma-make-adapter.ts for FigmaDesignContext shape.
  const figmaMake = {
    codeContent: frames
      .map(
        (f) => `<div class="screen" data-name="${f.name ?? 'screen'}">${f.name ?? 'screen'}</div>`,
      )
      .join('\n'),
    metadata: {
      author: 'fixture-gen',
      source: 'derived from reference.pen (Phase 7 DESIGN-04 D-03)',
    },
    screenNames: frames.map((f) => f.name ?? `Screen ${frames.indexOf(f)}`),
  }
  await writeFile(join(HERE, 'figma-make.json'), JSON.stringify(figmaMake, null, 2))
  console.log('  -> figma-make.json (FigmaDesignContext shape)')

  // ---- Emit stitch.zip (Stitch extractor input: HTML + PNG per screen) ----
  const zipPath = join(HERE, 'stitch.zip')
  const output = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(output)

  for (const [i, frame] of frames.entries()) {
    const screenName = frame.name ?? `Screen ${i}`
    const html = `<!DOCTYPE html>
<html>
<head><title>${screenName}</title></head>
<body>
  <div class="screen" data-layer="${screenName}">
    <h1>${screenName}</h1>
  </div>
</body>
</html>`
    archive.append(html, { name: `screen-${i}.html` })
    // Minimal PNG file header stub (8 bytes) — sufficient for fixture purposes
    archive.append(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
      name: `screen-${i}.png`,
    })
  }

  await archive.finalize()
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
  })
  console.log('  -> stitch.zip (HTML + PNG stubs per screen)')

  console.log('\nAll parity fixtures regenerated. Commit alongside reference.pen.')
}

main().catch((err) => {
  console.error('fixture-gen failed:', err)
  process.exit(1)
})
