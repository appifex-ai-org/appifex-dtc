import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
// Phase 04 (SEC-02, T-04-05): use execFileSync with array args — no shell
// interpolation of caller-controlled `zipPath` / `extractDir`. Mitigates STRIDE
// Tampering / EoP via the former template-string shell call.
import { execFileSync } from 'node:child_process'

/**
 * Artifacts extracted from a design-export zip.
 *
 * Shape-compatible with any design tool that exports standalone HTML plus
 * screenshots — e.g. Google Stitch, Figma Make "Export HTML", and
 * Claude Design (Anthropic Labs) "Standalone HTML files" export.
 */
export interface DesignZipArtifacts {
  /** Path to design.md (or DESIGN.md) if found — optional design-token source */
  designMdPath?: string
  /** Paths to HTML files found anywhere in the archive */
  htmlPaths: string[]
  /** Paths to PNG / JPEG screenshot files found anywhere in the archive */
  screenshotPaths: string[]
  /** Root directory the archive was extracted into */
  extractDir: string
}

/**
 * Extract a design-export zip into `{outputDir}/.design-import/` and collect
 * its HTML / screenshot / design.md artifacts.
 *
 * Tool-agnostic: works for any export that produces HTML + screenshots, including
 * Google Stitch, Figma Make, and Claude Design. The folder walk is recursive and
 * extension-based, so flat and nested archive layouts both work. A `design.md`
 * (case-insensitive) at any depth is picked up as an optional design-token source.
 *
 * @param zipPath   absolute path to the `.zip` archive
 * @param outputDir directory the extracted `.design-import/` folder is placed under
 */
export async function extractDesignZip(
  zipPath: string,
  outputDir: string,
): Promise<DesignZipArtifacts> {
  if (!existsSync(zipPath)) {
    throw new Error(`Design zip not found: ${zipPath}`)
  }

  const extractDir = join(outputDir, '.design-import')
  mkdirSync(extractDir, { recursive: true })

  // Phase 04 (SEC-02, T-04-05): array args prevent shell interpolation of
  // caller-controlled paths — a zipPath containing `; rm -rf /` would have
  // been executed by the former template-string shell call.
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractDir], { stdio: 'ignore' })

  const htmlPaths: string[] = []
  const screenshotPaths: string[] = []
  let designMdPath: string | undefined

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath)
        continue
      }
      const lower = entry.toLowerCase()
      if (lower === 'design.md') {
        designMdPath = fullPath
      } else if (lower.endsWith('.html')) {
        htmlPaths.push(fullPath)
      } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        screenshotPaths.push(fullPath)
      }
    }
  }

  walk(extractDir)

  return { designMdPath, htmlPaths, screenshotPaths, extractDir }
}
