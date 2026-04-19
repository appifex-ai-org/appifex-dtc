// Phase 04 (SEC-02, T-04-07): shell-safety helpers for the e2b + remote runners.
// Keeps glob semantics (caller patterns include `*`, `?`, `[...]`, `{...}`) while
// rejecting command-injection metacharacters. For strict quoting of non-glob
// values (e.g. the AVD name in emulator.ts), use `shell-quote` instead — see
// `packages/build/src/emulator.ts` for that case.

/**
 * Validates a glob pattern for shell-safe interpolation.
 *
 * Allows: alphanumerics, `._-/*?[]{},:@+=~` and spaces/tabs — the superset of
 * common glob syntax (`*`, `?`, character classes, brace expansion) plus
 * filesystem-path characters. Callers pass the returned value through
 * `sh -c ls -1 ${safe} 2>/dev/null` so glob wildcards MUST survive unquoted for
 * the shell to expand them. This is why we do NOT use `shell-quote` here:
 * quoting `*` as `'*'` would neutralise the wildcard and break every caller.
 * Newlines and carriage returns are rejected — they could split into a
 * multi-command shell script.
 *
 * Rejects: `;`, `&`, `|`, `$`, backtick, `<`, `>`, `(`, `)`, single-quote,
 * double-quote, newline, backslash — any character that could be interpreted
 * as a command separator, command substitution, I/O redirection, or quoted
 * arg context in a POSIX shell.
 *
 * Throws `Error('Unsafe glob pattern: ...')` on rejection. Returns the pattern
 * unchanged on success (for fluent use at the call site).
 *
 * STRIDE coverage: mitigates Tampering / EoP in `RemoteRunner.glob` and
 * `E2BRunner.glob` where the `pattern` argument originates from internal
 * callers that may transitively accept untrusted input (e.g. glob patterns
 * derived from design-file paths).
 *
 * @param pattern the caller-supplied glob pattern
 * @returns the same pattern, unchanged, iff it is safe to interpolate
 * @throws Error when the pattern contains any shell metacharacter not in the allowlist
 */
export function assertSafeGlobPattern(pattern: string): string {
  // Allowlist: bash-glob-safe chars only. Note: we include literal space and
  // tab but NOT `\s` (which would also match `\n` / `\r` — multi-line attacks).
  if (!/^[A-Za-z0-9._\-/*?[\]{},:@+=~ \t]*$/.test(pattern)) {
    throw new Error(`Unsafe glob pattern: ${pattern.slice(0, 100)}`)
  }
  return pattern
}
