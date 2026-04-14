import type { MethodSignature } from './swift.js'
import { escapeRegex, extractBracedBody } from './swift.js'

export type { MethodSignature }

/**
 * Extract arrow-function method signatures from a TypeScript interface block.
 * Only methods inside `interface InterfaceName { ... }` are returned.
 * Matches patterns like: `signIn: (email: string, password: string) => ...`
 * Uses brace-depth counting to handle nested type literals.
 */
export function extractTsInterfaceMethods(source: string, interfaceName: string): MethodSignature[] {
  const block = extractBracedBody(source, new RegExp(`(?:export\\s+)?interface\\s+${escapeRegex(interfaceName)}[^{]*`))
  if (!block) return []
  const methodRegex = /(\w+)\s*:\s*\(([^)]*)\)\s*=>/g
  const methods: MethodSignature[] = []
  let m: RegExpExecArray | null

  while ((m = methodRegex.exec(block)) !== null) {
    const name = m[1]
    const rawParams = m[2].trim()
    const params = rawParams.length === 0
      ? []
      : rawParams.split(',').map(p => p.trim()).filter(p => p.length > 0)
    methods.push({ name, params })
  }

  return methods
}
