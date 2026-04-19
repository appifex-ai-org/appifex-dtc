// Source: commitlint.js.org/#/guides-local-setup
// Phase 1 Plan 03 (REPO-03): Conventional Commits enforcement
export default {
  extends: ['@commitlint/config-conventional'],
  // Git merge commits (e.g. "Merge remote-tracking branch '...'") are not
  // authored by the team and cannot be rewritten without force-push — skip them.
  ignores: [(commit) => /^Merge /.test(commit)],
  rules: {
    // Allow long commit headers — many historical commits carry verbose phase/requirement refs
    'header-max-length': [0, 'always'],
    // Allow any subject casing — historical commits use sentence-case for test stubs etc.
    'subject-case': [0, 'always'],
    // Allow long lines in commit bodies (verbatim text, URLs, multi-paragraph rationale)
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'footer-leading-blank': [0, 'always'],
  },
}
