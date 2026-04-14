import type { MethodSignature } from './swift.js'
import { escapeRegex, extractBracedBody } from './swift.js'

export type { MethodSignature }

/**
 * Extract method signatures from a Kotlin interface block.
 * Only methods inside `interface InterfaceName { ... }` are returned —
 * methods in class/object bodies are ignored.
 * Uses brace-depth counting to handle interfaces with default method implementations.
 */
export function extractKotlinInterfaceMethods(
  source: string,
  interfaceName: string,
): MethodSignature[] {
  const block = extractBracedBody(
    source,
    new RegExp(`interface\\s+${escapeRegex(interfaceName)}[^{]*`),
  )
  if (!block) return []
  const methodRegex = /(?:suspend\s+)?fun\s+(\w+)\(([^)]*)\)/g
  const methods: MethodSignature[] = []
  let m: RegExpExecArray | null

  while ((m = methodRegex.exec(block)) !== null) {
    const name = m[1]
    const rawParams = m[2].trim()
    const params =
      rawParams.length === 0
        ? []
        : rawParams
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
    methods.push({ name, params })
  }

  return methods
}
