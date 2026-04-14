import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execSync } from 'node:child_process'

export interface StitchArtifacts {
  /** Path to design.md if found */
  designMdPath?: string
  /** Paths to HTML files */
  htmlPaths: string[]
  /** Paths to PNG/JPEG screenshot files */
  screenshotPaths: string[]
  /** Root directory of extracted files */
  extractDir: string
}

/**
 * Extract a Stitch export zip to outputDir/.stitch/
 * Returns paths to found artifacts (HTML, PNG, design.md).
 * Resilient to both flat and nested zip structures.
 */
export async function extractStitchZip(
  zipPath: string,
  outputDir: string,
): Promise<StitchArtifacts> {
  if (!existsSync(zipPath)) {
    throw new Error(`Stitch zip not found: ${zipPath}`)
  }

  const extractDir = join(outputDir, '.stitch')
  mkdirSync(extractDir, { recursive: true })

  execSync(`unzip -o -q "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' })

  const htmlPaths: string[] = []
  const screenshotPaths: string[] = []
  let designMdPath: string | undefined

  // Recursively walk extracted directory
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
