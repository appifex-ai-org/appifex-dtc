// Phase 03 (DX-02): balanced-brace walker shared by both Copilot
// JSON parse sites in copilot.ts. Finds the first top-level `{...}`
// object in `text`, respecting string literals and escape sequences
// (a backslash inside a string consumes the next character, so
// `\"` does NOT close the string and `\\` is a literal backslash).
// Returns `null` when no balanced object is present.
//
// Contract:
//   extractJsonObject('{"a":1}')       === '{"a":1}'
//   extractJsonObject('noise{"a":1}x') === '{"a":1}'
//   extractJsonObject('{{"a":1}}')     === '{{"a":1}}'
//   extractJsonObject('{bad')          === null
//   extractJsonObject('no json')       === null
//
// Note: returns the FIRST balanced object span. If callers see an
// object that does not JSON.parse (e.g. `{intro}` in prose before the
// real payload), they are expected to surface the parse failure
// rather than re-scan. That "re-scan on the keyword" behaviour is
// what broke the greedy regex this helper replaces.
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}
