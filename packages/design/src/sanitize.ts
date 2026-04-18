/**
 * Phase 7 (DESIGN-01 | DESIGN-02 | DESIGN-03): Shared layer-name sanitization.
 *
 * Every raw layer name from every design adapter (Pencil, Figma REST, Figma-Make,
 * Stitch) flows through `sanitizeLayerName` before becoming a PlatformSpec node id.
 * Deterministic and always productive — pathological names like "🎉 class" still
 * produce a compilable Swift/Kotlin identifier.
 *
 * Algorithm (D-02 from 07-CONTEXT.md):
 *   1. Strip non-ASCII: /[^\x20-\x7E]/g → ''
 *   2. Collapse non-alphanumeric runs to single space: /[^A-Za-z0-9]+/g → ' '
 *   3. Split on space + camelCase: first.toLowerCase() + rest.map(capitalize)
 *   4. Strip leading digits: /^[0-9]+/ → ''
 *   5. Empty result → 'node'
 *   6. Reserved word → append '_'
 *   7. Duplicate in scope → append '_2', '_3', … (caller passes `taken` Set)
 */

// Swift: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/lexicalstructure/
export const SWIFT_RESERVED: ReadonlySet<string> = new Set([
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate',
  'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator',
  'private', 'protocol', 'public', 'rethrows', 'static', 'struct', 'subscript',
  'typealias', 'var', 'break', 'case', 'continue', 'default', 'defer', 'do',
  'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return',
  'switch', 'where', 'while', 'catch', 'throw', 'try', 'as', 'is', 'nil',
  'self', 'Self', 'super', 'false', 'true', 'async', 'await', 'some', 'any',
  'mutating', 'nonmutating', 'override', 'final', 'lazy', 'weak', 'unowned',
])

// Kotlin: https://kotlinlang.org/docs/keyword-reference.html
export const KOTLIN_RESERVED: ReadonlySet<string> = new Set([
  // Hard keywords
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
  'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return',
  'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val',
  'var', 'when', 'while',
  // Common colliding modifier keywords
  'abstract', 'annotation', 'companion', 'const', 'data', 'enum', 'final',
  'inline', 'inner', 'internal', 'open', 'operator', 'out', 'override',
  'private', 'protected', 'public', 'sealed', 'suspend', 'value',
  // Soft keywords that commonly collide (safe to include — per RESEARCH line 564)
  'get', 'set', 'by', 'catch',
])

export const RESERVED: ReadonlySet<string> = new Set([
  ...SWIFT_RESERVED,
  ...KOTLIN_RESERVED,
])

/**
 * Sanitize a raw layer name into a safe SwiftUI + Kotlin identifier.
 * Deterministic, always productive. Mutates `taken` with the chosen identifier.
 *
 * Algorithm (D-02):
 *  1. Strip non-ASCII (emoji, accented, CJK): /[^\x20-\x7E]/g → ''
 *  2. Collapse punctuation/whitespace to single space: /[^A-Za-z0-9]+/g → ' '
 *  3. camelCase: parts[0].toLowerCase() + parts[1..].map(capitalize)
 *  4. Strip leading digits: /^[0-9]+/ → ''
 *  5. If empty → 'node'
 *  6. If in RESERVED → append '_'
 *  7. If already in `taken` → append '_2', '_3', … (find smallest free)
 *  8. Add chosen id to `taken`, return it.
 */
export function sanitizeLayerName(name: string, taken: Set<string>): string {
  // Step 1-2: strip non-ASCII then collapse punctuation/whitespace
  const ascii = name.replace(/[^\x20-\x7E]/g, '')
  const cleaned = ascii.replace(/[^A-Za-z0-9]+/g, ' ').trim()

  // Step 3: camelCase
  const parts = cleaned.split(' ').filter(Boolean)
  let camel =
    parts.length === 0
      ? ''
      : parts[0].toLowerCase() +
        parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')

  // Step 4: strip leading digits
  camel = camel.replace(/^[0-9]+/, '')

  // Step 5: empty fallback
  let candidate = camel === '' ? 'node' : camel

  // Step 6: reserved-word collision
  if (RESERVED.has(candidate)) {
    candidate = `${candidate}_`
  }

  // Step 7: duplicate-in-scope
  if (taken.has(candidate)) {
    const base = candidate
    let i = 2
    while (taken.has(`${base}_${i}`)) i++
    candidate = `${base}_${i}`
  }

  taken.add(candidate)
  return candidate
}
