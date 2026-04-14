import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Platform, SkillContent, SkillProvider } from './types.js'

/**
 * Loads skill content from a directory of markdown files.
 *
 * Supports two formats:
 *
 * 1. Structured (DTC native):
 *   skillsDir/
 *     shared/codegen/*.md
 *     swiftui/codegen/*.md, fix/*.md
 *     kotlin-compose/codegen/*.md, fix/*.md
 *
 * 2. Flat (backend/.claude/skills compatible):
 *   skillsDir/
 *     SKILL.md              ← main skill content
 *     references/*.md       ← additional reference docs
 */
async function readMdDir(dir: string): Promise<string> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return ''
  }
  const mdFiles = files.filter(f => f.endsWith('.md')).sort()
  const chunks: string[] = []
  for (const f of mdFiles) {
    const content = await readFile(join(dir, f), 'utf-8')
    chunks.push(content.trim())
  }
  return chunks.join('\n\n')
}

/**
 * Reads a flat skill directory (SKILL.md + references/*.md).
 * Strips YAML frontmatter from SKILL.md.
 */
async function readFlatSkillDir(dir: string): Promise<string> {
  const chunks: string[] = []

  // Read main SKILL.md
  try {
    let content = await readFile(join(dir, 'SKILL.md'), 'utf-8')
    // Strip YAML frontmatter
    content = content.replace(/^---\n[\s\S]*?\n---\n/, '')
    chunks.push(content.trim())
  } catch { /* no SKILL.md */ }

  // Read references/*.md
  const refs = await readMdDir(join(dir, 'references'))
  if (refs) chunks.push(refs)

  return chunks.join('\n\n')
}

async function isStructuredDir(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, 'shared'))
    return s.isDirectory()
  } catch {
    // Also check for platform dirs
    try {
      const s = await stat(join(dir, 'swiftui'))
      if (s.isDirectory()) return true
    } catch { /* not found */ }
    try {
      const s = await stat(join(dir, 'kotlin-compose'))
      return s.isDirectory()
    } catch {
      return false
    }
  }
}

async function isFlatSkillDir(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, 'SKILL.md'))
    return true
  } catch {
    return false
  }
}

export function createFileSkillProvider(skillsDir: string): SkillProvider {
  return {
    async load(platform: Platform): Promise<SkillContent> {
      // Auto-detect format
      if (await isFlatSkillDir(skillsDir)) {
        // Flat format: SKILL.md + references/ → used as codegen + fix prompt
        const content = await readFlatSkillDir(skillsDir)
        return { specPrompt: '', codegenPrompt: content, fixPrompt: content }
      }

      if (await isStructuredDir(skillsDir)) {
        // Structured format: shared/ + platform/ subdirs
        const sharedDir = join(skillsDir, 'shared')
        const platformDir = join(skillsDir, platform)
        const [sharedSpec, platformSpec, sharedCodegen, platformCodegen, sharedFix, platformFix] = await Promise.all([
          readMdDir(join(sharedDir, 'spec')),
          readMdDir(join(platformDir, 'spec')),
          readMdDir(join(sharedDir, 'codegen')),
          readMdDir(join(platformDir, 'codegen')),
          readMdDir(join(sharedDir, 'fix')),
          readMdDir(join(platformDir, 'fix')),
        ])
        return {
          specPrompt: [sharedSpec, platformSpec].filter(Boolean).join('\n\n'),
          codegenPrompt: [sharedCodegen, platformCodegen].filter(Boolean).join('\n\n'),
          fixPrompt: [sharedFix, platformFix].filter(Boolean).join('\n\n'),
        }
      }

      // Fallback: try reading all .md files in the dir as codegen prompt
      const content = await readMdDir(skillsDir)
      return { specPrompt: '', codegenPrompt: content, fixPrompt: content }
    },
  }
}

/** Returns the path to the bundled skills directory shipped with @appifex/core. */
export function getBundledSkillsDir(): string {
  const thisFile = fileURLToPath(import.meta.url)
  // dist/skill-loader.js → ../skills/
  return join(thisFile, '..', '..', 'skills')
}

export function createBundledSkillProvider(): SkillProvider {
  return createFileSkillProvider(getBundledSkillsDir())
}
