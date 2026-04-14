import { relative, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  Runner,
  BaasContext,
  Platform,
  BaasIntegrationViolation,
  BaasIntegrationResult,
} from '@appifex/core'
import { stripComments } from './comment-strip.js'
import * as swiftFirebase from './patterns/swift-firebase.js'
import * as kotlinFirebase from './patterns/kotlin-firebase.js'

// ── Internal types ────────────────────────────────────────────────────────────

interface WiringMetadata {
  templateHashes?: Record<string, string>
}

interface PatternSet {
  REQUIRED_IMPORTS: RegExp[]
  REAL_AUTH_CALLS: RegExp[]
  FACADE_PATTERNS: Array<{ pattern: RegExp; description: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function platformFromPath(filePath: string): Platform {
  const ext = extname(filePath)
  if (ext === '.swift') return 'swiftui'
  if (ext === '.kt') return 'kotlin-compose'
  // Fallback for unknown extensions — caller is responsible for filtering
  return 'kotlin-compose'
}

function patternSetFromPath(filePath: string): PatternSet {
  return extname(filePath) === '.swift' ? swiftFirebase : kotlinFirebase
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function checkBaasIntegration(
  runner: Runner,
  projectDir: string,
  baasContext: BaasContext,
): Promise<BaasIntegrationResult> {
  const start = Date.now()
  const violations: BaasIntegrationViolation[] = []

  // Collect all .swift and .kt files
  const [swiftFiles, ktFiles] = await Promise.all([
    runner.glob(`${projectDir}/**/*.swift`),
    runner.glob(`${projectDir}/**/*.kt`),
  ])
  const allFiles = [...swiftFiles, ...ktFiles]

  const platformsScanned: Platform[] = [
    ...(swiftFiles.length > 0 ? ['swiftui' as const] : []),
    ...(ktFiles.length > 0 ? ['kotlin-compose' as const] : []),
  ]

  // Per-file checks (DET-01, DET-02, DET-03)
  for (const file of allFiles) {
    const rawContent = await runner.readFile(file)
    const strippedContent = stripComments(rawContent)
    const relPath = relative(projectDir, file)
    // D-07: Mock*.swift and Mock*.kt are exempt from facade detection — they
    // intentionally contain patterns like MockUser/isAuthenticated that would
    // otherwise trigger FACADE_PATTERNS violations. Scope: basename only (D-08).
    const fileName = basename(file)
    if (fileName.startsWith('Mock')) {
      continue
    }
    const platform = platformFromPath(file)
    const patterns = patternSetFromPath(file)

    // DET-01: Missing import check (uses raw content — imports are at top, not in comments)
    const hasRequiredImport = patterns.REQUIRED_IMPORTS.some((p) => p.test(rawContent))
    if (!hasRequiredImport) {
      const importList = patterns.REQUIRED_IMPORTS.map((p) =>
        p.source
          .replace(/\\s\+/g, ' ')
          .replace(/\\/g, '')
          .replace(/\\\./g, '.')
          .replace(/\\\b/g, ''),
      ).join(' or ')
      violations.push({
        file: relPath,
        platform,
        type: 'missing_import',
        expected: `File should contain one of: ${importList}`,
        remediation: 'Add the required Firebase import at the top of the file',
      })
    }

    // DET-02 / DET-03: Facade detection (uses stripped content for both facade and real-auth check)
    let facadeMatch: { match: string; description: string } | null = null
    for (const { pattern, description } of patterns.FACADE_PATTERNS) {
      const m = strippedContent.match(pattern)
      if (m) {
        facadeMatch = { match: m[0], description }
        break
      }
    }

    if (facadeMatch !== null) {
      // Facade signal found — check if real auth call exists in stripped content
      const hasRealAuth = patterns.REAL_AUTH_CALLS.some((p) => p.test(strippedContent))
      if (!hasRealAuth) {
        const realCallExamples =
          platform === 'swiftui' ? 'Auth.auth()' : 'FirebaseAuth.getInstance()'
        violations.push({
          file: relPath,
          platform,
          type: 'facade_auth',
          matched: facadeMatch.match,
          expected: `Real SDK auth call (e.g. ${realCallExamples})`,
          remediation: `Remove "hardcoded ${facadeMatch.description}" and wire real Firebase Auth`,
        })
      }
    } else if (hasRequiredImport) {
      // No facade signal AND has required import — check for missing SDK call
      const hasRealAuth = patterns.REAL_AUTH_CALLS.some((p) => p.test(strippedContent))
      if (!hasRealAuth) {
        const realCallExamples =
          platform === 'swiftui' ? 'Auth.auth()' : 'FirebaseAuth.getInstance()'
        violations.push({
          file: relPath,
          platform,
          type: 'missing_sdk_call',
          expected: `File should contain a real Firebase Auth SDK call (e.g. ${realCallExamples})`,
          remediation: 'Add a real Firebase Auth SDK call to initialize and use authentication',
        })
      }
    }
  }

  // DET-04: Template hash check
  const meta = baasContext.wiringMetadata as WiringMetadata | undefined
  if (meta?.templateHashes) {
    for (const [relPath, expectedHash] of Object.entries(meta.templateHashes)) {
      const fullPath = `${projectDir}/${relPath}`
      let content: string
      try {
        content = await runner.readFile(fullPath)
      } catch {
        // File doesn't exist — treat as overwritten/deleted
        content = ''
      }
      const platform = platformFromPath(relPath)

      if (content === '' || hashContent(content) !== expectedHash) {
        violations.push({
          file: relPath,
          platform,
          type: 'template_overwritten',
          expected: 'File content should match pre-generated template hash',
          remediation:
            'BaaS auth template was overwritten during code generation — restore from template',
        })
      }
    }
  }

  return {
    allPassed: violations.length === 0,
    violations,
    filesScanned: allFiles.length,
    duration: Date.now() - start,
    platformsScanned,
  }
}
