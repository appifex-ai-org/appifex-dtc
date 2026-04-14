import { relative, basename } from 'node:path'
import type { Runner, Platform, MockLayerViolation, MockCheckResult, MockCheckContext } from '@appifex/core'
import { stripComments } from '@appifex/baas-check'
import { MOCK_CONTRACT_METHODS } from '@appifex/mock'
import { extractSwiftProtocolMethods, extractBracedBody } from './signature-extract/swift.js'
import { extractKotlinInterfaceMethods } from './signature-extract/kotlin.js'
import { extractTsInterfaceMethods } from './signature-extract/react.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function paramsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p === b[i])
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function checkMockLayer(
  runner: Runner,
  projectDir: string,
  _context: MockCheckContext,
): Promise<MockCheckResult> {
  const start = Date.now()
  const violations: MockLayerViolation[] = []

  // ── 1. Platform detection via file globs ────────────────────────────────
  const [swiftFiles, ktFiles, tsxFiles] = await Promise.all([
    runner.glob(`${projectDir}/**/*.swift`),
    runner.glob(`${projectDir}/**/*.kt`),
    runner.glob(`${projectDir}/**/*.tsx`),
  ])

  const allFiles = [...swiftFiles, ...ktFiles, ...tsxFiles]

  const platformsScanned: Platform[] = [
    ...(swiftFiles.length > 0 ? ['swiftui' as const] : []),
    ...(ktFiles.length > 0 ? ['kotlin-compose' as const] : []),
    ...(tsxFiles.length > 0 ? ['react' as const] : []),
  ]

  // ── 2. Entity detection — non-Mock *Repository files per platform ────────
  function entityFromRepoFile(filePath: string, ext: string): string | null {
    const name = basename(filePath)
    if (!name.endsWith(`Repository${ext}`)) return null
    if (name.startsWith('Mock')) return null
    return name.slice(0, name.length - `Repository${ext}`.length)
  }

  const swiftEntities = swiftFiles
    .map(f => entityFromRepoFile(f, '.swift'))
    .filter((e): e is string => e !== null)

  const ktEntities = ktFiles
    .map(f => entityFromRepoFile(f, '.kt'))
    .filter((e): e is string => e !== null)

  const tsxEntities = tsxFiles
    .map(f => entityFromRepoFile(f, '.tsx'))
    .filter((e): e is string => e !== null)

  // ── 3. Helper: find file by basename pattern ─────────────────────────────
  function findFile(files: string[], namePattern: string): string | undefined {
    return files.find(f => basename(f) === namePattern)
  }

  // ── 4. Completeness checks (MISSING_MOCK) ────────────────────────────────

  // Swift
  if (swiftFiles.length > 0) {
    const authManagerFile = findFile(swiftFiles, 'MockAuthManager.swift')
    if (!authManagerFile) {
      violations.push({
        file: `MockAuthManager.swift`,
        platform: 'swiftui',
        type: 'MISSING_MOCK',
        remediation: 'Create MockAuthManager.swift implementing the AuthManaging protocol',
      })
    }

    for (const entity of swiftEntities) {
      const mockFile = findFile(swiftFiles, `Mock${entity}Repository.swift`)
      if (!mockFile) {
        violations.push({
          file: `Mock${entity}Repository.swift`,
          platform: 'swiftui',
          type: 'MISSING_MOCK',
          entity,
          remediation: `Create Mock${entity}Repository.swift implementing the ${entity}RepositoryProtocol`,
        })
      }
    }
  }

  // Kotlin
  if (ktFiles.length > 0) {
    const authManagerFile = findFile(ktFiles, 'MockAuthManager.kt')
    if (!authManagerFile) {
      violations.push({
        file: `MockAuthManager.kt`,
        platform: 'kotlin-compose',
        type: 'MISSING_MOCK',
        remediation: 'Create MockAuthManager.kt implementing the AuthManagerInterface',
      })
    }

    // Note: Kotlin has NO MockDataService aggregator (D-02)
    for (const entity of ktEntities) {
      const mockFile = findFile(ktFiles, `Mock${entity}Repository.kt`)
      if (!mockFile) {
        violations.push({
          file: `Mock${entity}Repository.kt`,
          platform: 'kotlin-compose',
          type: 'MISSING_MOCK',
          entity,
          remediation: `Create Mock${entity}Repository.kt implementing the ${entity}RepositoryInterface`,
        })
      }
    }
  }

  // React
  if (tsxFiles.length > 0) {
    const authManagerFile = findFile(tsxFiles, 'MockAuthManager.tsx')
    if (!authManagerFile) {
      violations.push({
        file: `MockAuthManager.tsx`,
        platform: 'react',
        type: 'MISSING_MOCK',
        remediation: 'Create MockAuthManager.tsx implementing the AuthContextValue interface',
      })
    }

    // MockDataService.tsx is mandatory for React (D-02)
    const dataServiceFile = findFile(tsxFiles, 'MockDataService.tsx')
    if (!dataServiceFile) {
      violations.push({
        file: `MockDataService.tsx`,
        platform: 'react',
        type: 'MISSING_MOCK',
        remediation: 'Create MockDataService.tsx — mandatory React mock aggregator',
      })
    }

    for (const entity of tsxEntities) {
      const mockFile = findFile(tsxFiles, `Mock${entity}Repository.tsx`)
      if (!mockFile) {
        violations.push({
          file: `Mock${entity}Repository.tsx`,
          platform: 'react',
          type: 'MISSING_MOCK',
          entity,
          remediation: `Create Mock${entity}Repository.tsx implementing the ${entity}RepositoryValue interface`,
        })
      }
    }
  }

  // ── 5. Interface parity checks (MISSING_METHOD, SIGNATURE_MISMATCH) ──────

  // Swift auth manager parity
  const swiftAuthFile = findFile(swiftFiles, 'MockAuthManager.swift')
  if (swiftAuthFile) {
    const rawSource = await runner.readFile(swiftAuthFile)
    const source = stripComments(rawSource)
    const interfaceMethods = extractSwiftProtocolMethods(source, 'AuthManaging')
    const mockMethods = extractSwiftProtocolMethods(source, 'MockAuthManager')

    // Extract from class body using brace-depth counting (CR-01 fix).
    const classBlock = extractBracedBody(rawSource, /(?:class|struct|final\s+class)\s+MockAuthManager[^{]*/)
    const classMethods: Array<{ name: string; params: string[] }> = []
    if (classBlock) {
      const funcRegex = /func\s+(\w+)\(([^)]*)\)/g
      let m: RegExpExecArray | null
      while ((m = funcRegex.exec(classBlock)) !== null) {
        const name = m[1]
        const rawParams = m[2].trim()
        const params = rawParams.length === 0
          ? []
          : rawParams.split(',').map(p => p.trim()).filter(p => p.length > 0)
        classMethods.push({ name, params })
      }
    }

    const allMockMethods = [...mockMethods, ...classMethods]

    // Contract-driven method presence check (D-05: replaces protocol-derived method list)
    for (const methodName of MOCK_CONTRACT_METHODS) {
      const mockMethod = allMockMethods.find(m => m.name === methodName)
      if (!mockMethod) {
        violations.push({
          file: relative(projectDir, swiftAuthFile),
          platform: 'swiftui',
          type: 'MISSING_METHOD',
          method: methodName,
          expected: methodName,
          remediation: `Add func ${methodName}(...) to MockAuthManager to satisfy MockServiceContract`,
        })
      }
    }

    // Signature mismatch check (uses protocol extractors for parameter comparison)
    for (const ifMethod of interfaceMethods) {
      const mockMethod = allMockMethods.find(m => m.name === ifMethod.name)
      if (mockMethod && !paramsEqual(ifMethod.params, mockMethod.params)) {
        violations.push({
          file: relative(projectDir, swiftAuthFile),
          platform: 'swiftui',
          type: 'SIGNATURE_MISMATCH',
          method: ifMethod.name,
          expected: `func ${ifMethod.name}(${ifMethod.params.join(', ')})`,
          actual: `func ${ifMethod.name}(${mockMethod.params.join(', ')})`,
          remediation: `Fix ${ifMethod.name} signature in MockAuthManager to match AuthManaging protocol`,
        })
      }
    }
  }

  // Kotlin auth manager parity
  const ktAuthFile = findFile(ktFiles, 'MockAuthManager.kt')
  if (ktAuthFile) {
    const rawSource = await runner.readFile(ktAuthFile)
    const source = stripComments(rawSource)
    const interfaceMethods = extractKotlinInterfaceMethods(source, 'AuthManagerInterface')

    // Extract methods from object/class body using brace-depth counting (CR-01 fix).
    const objectBlock = extractBracedBody(rawSource, /(?:object|class)\s+MockAuthManager[^{]*/)
    const mockMethods: Array<{ name: string; params: string[] }> = []
    if (objectBlock) {
      const funcRegex = /(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\(([^)]*)\)/g
      let m: RegExpExecArray | null
      while ((m = funcRegex.exec(objectBlock)) !== null) {
        const name = m[1]
        const rawParams = m[2].trim()
        const params = rawParams.length === 0
          ? []
          : rawParams.split(',').map(p => p.trim()).filter(p => p.length > 0)
        mockMethods.push({ name, params })
      }
    }

    // Contract-driven method presence check (D-05: replaces protocol-derived method list)
    for (const methodName of MOCK_CONTRACT_METHODS) {
      const mockMethod = mockMethods.find(m => m.name === methodName)
      if (!mockMethod) {
        violations.push({
          file: relative(projectDir, ktAuthFile),
          platform: 'kotlin-compose',
          type: 'MISSING_METHOD',
          method: methodName,
          expected: methodName,
          remediation: `Add fun ${methodName}(...) to MockAuthManager to satisfy MockServiceContract`,
        })
      }
    }

    // Signature mismatch check (uses interface extractors for parameter comparison)
    for (const ifMethod of interfaceMethods) {
      const mockMethod = mockMethods.find(m => m.name === ifMethod.name)
      if (mockMethod && !paramsEqual(ifMethod.params, mockMethod.params)) {
        violations.push({
          file: relative(projectDir, ktAuthFile),
          platform: 'kotlin-compose',
          type: 'SIGNATURE_MISMATCH',
          method: ifMethod.name,
          expected: `fun ${ifMethod.name}(${ifMethod.params.join(', ')})`,
          actual: `fun ${ifMethod.name}(${mockMethod.params.join(', ')})`,
          remediation: `Fix ${ifMethod.name} signature in MockAuthManager to match AuthManagerInterface`,
        })
      }
    }
  }

  // React auth manager parity
  const reactAuthFile = findFile(tsxFiles, 'MockAuthManager.tsx')
  if (reactAuthFile) {
    const rawSource = await runner.readFile(reactAuthFile)
    const source = stripComments(rawSource)
    const interfaceMethods = extractTsInterfaceMethods(source, 'AuthContextValue')

    // Extract methods from function body (look for arrow functions assigned to const).
    // Known limitation (WR-03): Only matches `const name = (...) =>` patterns
    // (with optional useCallback/async). Regular function declarations, object
    // property methods, and other patterns are not matched. This is acceptable
    // because codegen templates exclusively emit the arrow function convention.
    const arrowFuncRegex = /const\s+(\w+)\s*=\s*(?:useCallback\s*\()?\s*(?:async\s*)?\(([^)]*)\)\s*=>/g
    const mockMethods: Array<{ name: string; params: string[] }> = []
    let m: RegExpExecArray | null
    while ((m = arrowFuncRegex.exec(source)) !== null) {
      const name = m[1]
      const rawParams = m[2].trim()
      const params = rawParams.length === 0
        ? []
        : rawParams.split(',').map(p => p.trim().replace(/^_/, '')).filter(p => p.length > 0)
      mockMethods.push({ name, params })
    }

    // Contract-driven method presence check (D-05: replaces interface-derived method list)
    for (const methodName of MOCK_CONTRACT_METHODS) {
      const mockMethod = mockMethods.find(m => m.name === methodName)
      if (!mockMethod) {
        violations.push({
          file: relative(projectDir, reactAuthFile),
          platform: 'react',
          type: 'MISSING_METHOD',
          method: methodName,
          expected: methodName,
          remediation: `Add ${methodName}(...) implementation to MockAuthProvider to satisfy MockServiceContract`,
        })
      }
    }
    // Note: React signature mismatch is harder to detect precisely due to
    // destructuring/underscore prefixes — skip for now, MISSING_METHOD is primary check
  }

  return {
    allPassed: violations.length === 0,
    violations,
    filesScanned: allFiles.length,
    duration: Date.now() - start,
    platformsScanned,
  }
}
