const BANNED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /allow\s+read\s*,\s*write\s*:\s*if\s+true/,
    description: 'Firestore open-access rule (allow read, write: if true)',
  },
  {
    pattern: /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    description: 'Supabase RLS disabled (DISABLE ROW LEVEL SECURITY)',
  },
]

export interface SecurityLintResult {
  passed: boolean
  violations: string[]
}

export function lintSecurityRules(content: string): SecurityLintResult {
  const violations: string[] = []
  for (const { pattern, description } of BANNED_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`Banned pattern detected: ${description}`)
    }
  }
  return { passed: violations.length === 0, violations }
}
