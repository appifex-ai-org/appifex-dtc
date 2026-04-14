/**
 * Strip single-line (//) and multi-line (/* ... *​/) comments from source code.
 *
 * Known limitation: does not handle // inside string literals (e.g., URLs).
 * Accepted for this use case — detection patterns (Auth.auth(), FirebaseAuth.getInstance())
 * are unlikely to appear inside string literals. See RESEARCH.md Pitfall 2.
 */
export function stripComments(source: string): string {
  // Remove multi-line /* ... */ blocks (non-greedy)
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Remove single-line // to end of line
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}
