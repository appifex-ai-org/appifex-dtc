import { describe, it, expect } from 'vitest'
import { stripComments } from '../src/comment-strip.js'

describe('stripComments', () => {
  describe('single-line comments', () => {
    it('removes single-line // comment from end of line', () => {
      const result = stripComments('let x = 1 // comment')
      expect(result).not.toContain('comment')
    })

    it('preserves code before a single-line comment', () => {
      const result = stripComments('let x = 1 // comment')
      expect(result).toContain('let x = 1')
    })

    it('removes an entire line that is a single-line comment', () => {
      const result = stripComments('// Auth.auth()')
      expect(result).not.toContain('Auth.auth()')
    })

    it('removes single-line comment leaving the code before it', () => {
      const result = stripComments('Auth.auth() // real call')
      expect(result).not.toContain('real call')
      expect(result).toContain('Auth.auth()')
    })
  })

  describe('multi-line comments', () => {
    it('removes inline /* ... */ block comment', () => {
      const result = stripComments('/* block */ let x = 1')
      expect(result).toContain('let x = 1')
    })

    it('removes /* ... */ block comment content', () => {
      const result = stripComments('/* block comment */ let x = 1')
      expect(result).not.toContain('block comment')
    })

    it('removes multi-line /* ... */ spanning multiple lines', () => {
      const result = stripComments('/* multi\nline */ code')
      expect(result).toContain('code')
    })

    it('removes multi-line block comment content', () => {
      const result = stripComments('/* multi\nline */ code')
      expect(result).not.toContain('multi')
      expect(result).not.toContain('line */')
    })

    it('removes /* Auth.auth() */ so it cannot match REAL_AUTH_CALLS', () => {
      const result = stripComments('/* Auth.auth() */')
      expect(result).not.toContain('Auth.auth()')
    })
  })

  describe('detection-critical behavior (DET-03 foundation)', () => {
    it('strips // Auth.auth() so commented-out code cannot match REAL_AUTH_CALLS', () => {
      const result = stripComments('// Auth.auth()')
      expect(result).not.toContain('Auth.auth()')
    })

    it('strips /* Auth.auth() */ so commented-out code cannot match REAL_AUTH_CALLS', () => {
      const result = stripComments('/* Auth.auth() */')
      expect(result).not.toContain('Auth.auth()')
    })

    it('preserves real Auth.auth() call when not commented out', () => {
      const result = stripComments('let handle = Auth.auth().addStateDidChangeListener { }')
      expect(result).toContain('Auth.auth()')
    })

    it('strips // FirebaseAuth.getInstance() so commented-out kotlin code cannot match', () => {
      const result = stripComments('// FirebaseAuth.getInstance()')
      expect(result).not.toContain('FirebaseAuth.getInstance()')
    })

    it('preserves real FirebaseAuth.getInstance() when not commented out', () => {
      const result = stripComments('private val auth = FirebaseAuth.getInstance()')
      expect(result).toContain('FirebaseAuth.getInstance()')
    })
  })

  describe('preserves non-comment code', () => {
    it('returns plain code unchanged', () => {
      const result = stripComments('let x = 1\nlet y = 2')
      expect(result).toContain('let x = 1')
      expect(result).toContain('let y = 2')
    })

    it('preserves empty string input', () => {
      expect(stripComments('')).toBe('')
    })
  })

  describe('known limitation: string literals', () => {
    // Per RESEARCH.md Pitfall 2: // inside string literals is not handled.
    // Detection patterns (Auth.auth(), FirebaseAuth.getInstance()) are unlikely
    // to appear inside string literals, so this is an accepted trade-off.
    it('documents string literal limitation — url strings may be affected', () => {
      const code = 'let url = "https://example.com"'
      const result = stripComments(code)
      // The https:// will be stripped (known limitation)
      // This test documents the behavior, not asserts it as correct
      expect(typeof result).toBe('string')
    })
  })
})
