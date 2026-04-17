const BANNED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /allow\s+read\s*,\s*write\s*:\s*if\s+true/,
    description: 'Firestore open-access rule (allow read, write: if true)',
  },
  {
    pattern: /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    description: 'Supabase RLS disabled (DISABLE ROW LEVEL SECURITY)',
  },
  // Phase 4 (FIRE-05 D-12): cross-user read — allow read without ownership check is a hard-fail
  // Matches any 'allow read' (or 'allow get/list') not followed by an ownership assertion.
  // Note: this regex is intentionally conservative — it flags 'allow read: if request.auth != null'
  // as a violation; generated rules MUST include resource.data.ownerId == request.auth.uid.
  {
    pattern: /allow\s+(?:read|get|list)\s*:[^;{]*?if\s+(?!false)(?!.*request\.auth\.uid\s*==\s*resource\.data\.ownerId)/,
    description: 'Cross-user read: allow read without request.auth.uid == resource.data.ownerId ownership check',
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

  // Phase 4 (FIRE-05 D-12): missing deny-all default — Firestore rules MUST have a catch-all deny block
  // Only checked for Firestore rules (not Supabase RLS or other formats).
  // Matches: match /{document=**} { allow read, write: if false; }
  const IS_FIRESTORE_RULES = /service\s+cloud\.firestore|rules_version/.test(content)
  if (IS_FIRESTORE_RULES) {
    const DENY_ALL_PATTERN =
      /match\s+\/\{document=\*\*\}\s*\{[^}]*allow\s+read\s*,\s*write\s*:\s*if\s+false/
    if (!DENY_ALL_PATTERN.test(content)) {
      violations.push(
        'Missing deny-all default (match /{document=**} { allow read, write: if false; })',
      )
    }
  }

  return { passed: violations.length === 0, violations }
}
