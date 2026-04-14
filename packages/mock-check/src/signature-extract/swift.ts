export interface MethodSignature {
  name: string
  params: string[]
}

/** Escape regex metacharacters in a string for safe interpolation into RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract the body of a braced block using brace-depth counting.
 * Finds the first match of `startPattern` in `source`, locates the opening `{`,
 * then counts `{`/`}` to find the matching closing brace. Returns the content
 * between the outermost braces, or null if the pattern isn't found.
 */
export function extractBracedBody(source: string, startPattern: RegExp): string | null {
  const startMatch = startPattern.exec(source)
  if (!startMatch) return null

  const searchFrom = startMatch.index + startMatch[0].length
  const openIndex = source.indexOf('{', startMatch[0].endsWith('{') ? searchFrom - 1 : searchFrom)
  if (openIndex === -1) return null

  let depth = 1
  let i = openIndex + 1
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    i++
  }

  if (depth !== 0) return null
  return source.slice(openIndex + 1, i - 1)
}

/**
 * Extract method signatures from a Swift protocol block.
 * Only methods inside `protocol ProtocolName { ... }` are returned —
 * methods in class/struct bodies are ignored.
 * Uses brace-depth counting to handle nested `{ get }` property declarations.
 */
export function extractSwiftProtocolMethods(
  source: string,
  protocolName: string,
): MethodSignature[] {
  const block = extractBracedBody(
    source,
    new RegExp(`protocol\\s+${escapeRegex(protocolName)}[^{]*`),
  )
  if (!block) return []
  const methodRegex = /func\s+(\w+)\(([^)]*)\)/g
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
