// Source: commitlint.js.org/#/guides-local-setup
// Phase 1 Plan 03 (REPO-03): Conventional Commits enforcement
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow long lines in commit bodies (verbatim text, URLs, multi-paragraph rationale)
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'footer-leading-blank': [0, 'always'],
  },
}
