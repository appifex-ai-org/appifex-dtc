import type { Runner } from '@appifex/core'

export interface PrecheckIssue {
  file: string
  line: number
  message: string
  fix: string
}

export interface PrecheckResult {
  issues: PrecheckIssue[]
  passed: boolean
}

const DEPRECATED_PATTERNS: Array<{ pattern: RegExp; message: string; fix: string }> = [
  {
    pattern: /\bNavigationView\b/,
    message: 'NavigationView is deprecated in iOS 16+',
    fix: 'Replace with NavigationStack',
  },
  {
    pattern: /\bObservableObject\b/,
    message: 'ObservableObject is deprecated — use @Observable (iOS 17+)',
    fix: 'Replace with @MainActor @Observable final class',
  },
  {
    pattern: /\b@Published\b/,
    message: '@Published is deprecated with @Observable',
    fix: 'Remove @Published — @Observable tracks mutations automatically',
  },
  {
    pattern: /\b@StateObject\b/,
    message: '@StateObject is deprecated with @Observable',
    fix: 'Replace with @State',
  },
  {
    pattern: /\b@ObservedObject\b/,
    message: '@ObservedObject is deprecated with @Observable',
    fix: 'Pass directly or use @Bindable',
  },
  {
    pattern: /\b@EnvironmentObject\b/,
    message: '@EnvironmentObject is deprecated with @Observable',
    fix: 'Replace with @Environment(MyType.self)',
  },
  {
    pattern: /\.foregroundColor\(/,
    message: 'foregroundColor() is deprecated',
    fix: 'Replace with .foregroundStyle()',
  },
  {
    pattern: /\.cornerRadius\(/,
    message: 'cornerRadius() is deprecated',
    fix: 'Replace with .clipShape(.rect(cornerRadius: N))',
  },
]

/**
 * Fast pre-build check that catches issues before invoking xcodebuild.
 * Scans generated Swift files for deprecated APIs, duplicate declarations, and structural issues.
 */
export async function swiftPrecheck(runner: Runner, projectDir: string): Promise<PrecheckResult> {
  const issues: PrecheckIssue[] = []

  const swiftFiles = await runner.glob(`${projectDir}/Sources/**/*.swift`)
  if (swiftFiles.length === 0) {
    return {
      issues: [
        {
          file: 'Sources/',
          line: 0,
          message: 'No Swift files found in Sources/',
          fix: 'Codegen may have failed',
        },
      ],
      passed: false,
    }
  }

  // Track all type declarations to detect duplicates
  const typeDeclarations = new Map<string, { file: string; line: number }[]>()
  const typeRegex =
    /^\s*(?:public\s+|internal\s+|private\s+|fileprivate\s+)?(?:final\s+)?(?:struct|class|enum|protocol|actor)\s+(\w+)/

  for (const filePath of swiftFiles) {
    let content: string
    try {
      content = await runner.readFile(filePath)
    } catch {
      continue
    }

    const shortPath = filePath.replace(`${projectDir}/`, '')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNum = i + 1

      // Check deprecated patterns
      for (const { pattern, message, fix } of DEPRECATED_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({ file: shortPath, line: lineNum, message, fix })
        }
      }

      // Track type declarations
      const typeMatch = line.match(typeRegex)
      if (typeMatch) {
        const typeName = typeMatch[1]
        if (!typeDeclarations.has(typeName)) {
          typeDeclarations.set(typeName, [])
        }
        typeDeclarations.get(typeName)!.push({ file: shortPath, line: lineNum })
      }
    }
  }

  // Check for duplicate type declarations
  for (const [typeName, locations] of typeDeclarations) {
    if (locations.length > 1) {
      for (const loc of locations) {
        issues.push({
          file: loc.file,
          line: loc.line,
          message: `Duplicate declaration of '${typeName}' (also in ${locations
            .filter((l) => l !== loc)
            .map((l) => l.file)
            .join(', ')})`,
          fix: `Remove one of the duplicate '${typeName}' declarations — keep only one definition`,
        })
      }
    }
  }

  return { issues, passed: issues.length === 0 }
}

/**
 * Auto-fix deprecated APIs in place. Returns the number of files modified.
 */
export async function swiftAutofix(
  runner: Runner,
  projectDir: string,
  issues: PrecheckIssue[],
): Promise<number> {
  const fileIssues = new Map<string, PrecheckIssue[]>()
  for (const issue of issues) {
    if (!fileIssues.has(issue.file)) fileIssues.set(issue.file, [])
    fileIssues.get(issue.file)!.push(issue)
  }

  let filesModified = 0

  for (const [relPath] of fileIssues) {
    const fullPath = `${projectDir}/${relPath}`
    let content: string
    try {
      content = await runner.readFile(fullPath)
    } catch {
      continue
    }

    let modified = content

    // Apply safe auto-fixes (these are mechanical replacements)
    modified = modified.replace(/\bNavigationView\b/g, 'NavigationStack')
    modified = modified.replace(/\.foregroundColor\(/g, '.foregroundStyle(')
    modified = modified.replace(/\.cornerRadius\((\d+)\)/g, '.clipShape(.rect(cornerRadius: $1))')

    if (modified !== content) {
      await runner.writeFile(fullPath, modified)
      filesModified++
    }
  }

  return filesModified
}
