import { describe, it, expect } from 'vitest'
import { extractJsonObject } from '../src/providers/json-extract.js'

// Phase 03 (DX-02): pin the balanced-brace JSON extractor contract.
//
// The helper is intentionally dumb: it returns the FIRST balanced
// `{...}` span, respecting string literals + escapes. Callers are
// responsible for rejecting shapes that do not contain the expected
// key — we do NOT re-scan after a failed JSON.parse. That is what
// broke today's greedy regex at copilot.ts:132 and :217.

describe('extractJsonObject', () => {
  it('returns the JSON span when prose contains the literal keyword before it', () => {
    const input = 'Here are the files for you: {"files":[{"path":"a.tsx","content":"x"}]}'
    expect(extractJsonObject(input)).toBe('{"files":[{"path":"a.tsx","content":"x"}]}')
  })

  it('returns the first balanced brace span when prose contains a stray { before real JSON', () => {
    // Per the spec: extractor returns the FIRST balanced object. `{intro}`
    // is the first balanced span here. Downstream JSON.parse will fail
    // and the caller will surface the error. Do NOT try to skip ahead to
    // the "real" JSON — that was the bug we are fixing.
    const input = '{intro} about files, then: {"files":[]}'
    expect(extractJsonObject(input)).toBe('{intro}')
  })

  it('respects nested braces inside string literals', () => {
    const input = '{"files":[{"path":"a","content":"{ not json }"}]}'
    expect(extractJsonObject(input)).toBe(input)
  })

  it('returns null when there is no opening brace', () => {
    expect(extractJsonObject('no json here')).toBeNull()
  })

  it('returns null when the object is unbalanced (no closing brace)', () => {
    expect(extractJsonObject('{ "files": [')).toBeNull()
  })

  it('handles escaped quotes inside strings correctly', () => {
    // Escaped quote inside a string must NOT toggle string state.
    const input = '{"msg":"he said \\"hi\\" to me"}'
    expect(extractJsonObject(input)).toBe(input)
  })

  it('handles escaped backslash inside strings correctly', () => {
    // A backslash-escape consumes the next char — so `\\` is a literal
    // backslash and the `"` after it still closes the string.
    const input = '{"path":"a\\\\b"}'
    expect(extractJsonObject(input)).toBe(input)
  })

  it('returns a simple {} on empty-object input', () => {
    expect(extractJsonObject('{}')).toBe('{}')
  })

  it('ignores braces inside strings when counting depth', () => {
    // Brace inside a string must not increment depth.
    const input = '{"s":"}"}'
    expect(extractJsonObject(input)).toBe(input)
  })
})
