---
phase: 1
slug: open-source-release-readiness
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
audited: 2026-04-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.0 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm exec vitest related --run <file>` |
| **Full suite command** | `pnpm test` (→ `vitest run`) |
| **Estimated runtime** | ~30s quick / ~3 min full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest related --run` on staged TS (via lefthook hook)
- **After every plan wave:** Run `pnpm check` (lint + format-check + typecheck + test)
- **Before `/gsd-verify-work`:** `pnpm check` green + `pnpm -r exec npm publish --dry-run --access public` green
- **Max feedback latency:** ~30 seconds (per-task)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-02-01 | 01-02 | 1 | REPO-01 | — | All hygiene files present | smoke | `test -f LICENSE && test -f README.md && test -f CONTRIBUTING.md && test -f CODE_OF_CONDUCT.md && test -f SECURITY.md && test -f .github/PULL_REQUEST_TEMPLATE.md && test -f .github/CODEOWNERS` | ✅ | ✅ green |
| 1-04-01 | 01-04 | 1 | REPO-02 | T-secret-leak | gitleaks pre-commit + CI exists, history clean | smoke | `grep -q gitleaks lefthook.yml && grep -q gitleaks .github/workflows/ci.yml` | ✅ | ✅ green |
| 1-03-01 | 01-03 | 1 | REPO-03 | — | commitlint catches non-conventional commits | smoke | `echo 'bad msg' \| pnpm exec commitlint` exits 1 | ✅ | ✅ green |
| 1-05-01 | 01-05 | 1 | REPO-03 | — | `.changeset/` exists + config valid | smoke | `test -f .changeset/config.json && jq -e .changelog .changeset/config.json` | ✅ | ✅ green |
| 1-02-02 | 01-02 | 1 | REPO-04 | — | `docs/` has three files | smoke | `test -f docs/getting-started.md && test -f docs/cli-reference.md && test -f docs/contributing.md` | ✅ | ✅ green |
| 1-08-01 | 01-08 | 2 | NPM-01 | T-bad-publish-meta | Every published pkg has correct publishConfig | unit | `pnpm exec vitest run packages/__tests__/publish-metadata.test.ts` | ✅ | ✅ green (164 tests) |
| 1-08-02 | 01-08 | 2 | NPM-01 | — | `npm publish --dry-run` succeeds for every pkg | integration | `pnpm -r exec npm publish --dry-run --access public` (CI: `publish-dry-run` job) | ✅ | ✅ green |
| 1-05-02 | 01-05 | 1 | NPM-02 | T-unauth-publish | Release workflow uses changesets/action + provenance | smoke | `grep -q 'changesets/action' .github/workflows/release.yml && grep -q 'id-token: write' .github/workflows/release.yml` | ✅ | ✅ green |
| 1-09-01 | 01-09 | 3 | FLOW-01 | — | `develop` branch exists on remote | manual | `git ls-remote --heads origin develop` | — | ✅ green (manual — verified live 2026-04-15) |
| 1-09-02 | 01-09 | 3 | FLOW-01 | T-force-push | Branch protection active on main + develop | manual | `gh api repos/{owner}/{repo}/branches/main/protection` | — | ✅ green (manual — verified live 2026-04-15) |
| 1-06-01 | 01-06 | 2 | GATE-01 | — | lint + typecheck + test green on clean tree | integration | `pnpm check` | ✅ | ✅ green (at Phase 1 completion; post-Phase-1 regressions are out-of-scope) |
| 1-10-01 | 01-10 | 3 | GATE-02 | — | E2E build-only job reaches Build phase hermetically | integration | `e2e-build` CI job via `DTC_LLM_MODE=fixture --design-ir` (no LLM tokens) | ✅ | ✅ green (PR #5 confirmed) |
| 1-09-03 | 01-09 | 3 | GATE-03 | T-malicious-commit | CODEOWNERS valid + branch protection requires code-owner review | manual | `gh api repos/{owner}/{repo}/branches/main/protection` asserts `require_code_owner_reviews: true` | — | ✅ green (manual — verified live 2026-04-15) |
| 1-11-01 | 01-11 | 3 | GATE-04 | — | PR missing changeset fails `changeset-check` job | manual | Open scratch PR; observe `changeset-check` red | — | ✅ green (manual — PR #6 confirmed) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 deliverables shipped in Phase 1 PR (commit 5ef7035):

- [x] `eslint.config.js` — flat config (Plan 01-03)
- [x] `.prettierrc.json` + `.prettierignore` — (Plan 01-03)
- [x] `lefthook.yml` — pre-commit + commit-msg hooks (Plan 01-04)
- [x] `commitlint.config.js` — conventional commits enforcement (Plan 01-03)
- [x] `.gitleaks.toml` — secret scanning config (Plan 01-04)
- [x] `.changeset/config.json` — independent versioning (Plan 01-05)
- [x] `packages/__tests__/publish-metadata.test.ts` — NPM-01 guard test (Plan 01-08)
- [x] `fixtures/tiny-mock/design.pen` — hermetic E2E fixture (Plan 01-07)
- [x] `.github/workflows/ci.yml`, `e2e.yml`, `release.yml` — CI/CD (Plans 01-06, 01-07, 01-05)
- [x] `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md` — governance (Plan 01-02)
- [x] `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` — hygiene (Plan 01-02)
- [x] `README.md` — rewrite (Plan 01-02)
- [x] `docs/getting-started.md`, `cli-reference.md`, `contributing.md` — docs scaffold (Plan 01-02)
- [x] Root `package.json` scripts — `lint`, `format`, `format:check`, `typecheck`, `check` (Plan 01-03)

Framework install: ✅ already in place (Vitest 4.0.0). No new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `develop` branch creation + protection rules | FLOW-01, GATE-03 | Requires GitHub repo admin context outside of CI | Run `scripts/setup-branch-protection.sh`; verify via `gh api .../branches/{main,develop}/protection` |
| PR-without-changeset gate behavior | GATE-04 | Requires opening a real scratch PR | Push throwaway branch with no `.changeset/*.md`, open PR, observe `changeset-check` red |
| Signed-commit enforcement | GATE-03 / D-14 | Requires unsigned-commit attempt against protected branch | Push unsigned commit on `feature/*`; verify PR merge blocked |
| Code-owner review required | GATE-03 | Requires PR opened by non-codeowner | Open PR from another GH account; verify merge blocked until code-owner approves |

All four verified live 2026-04-15 per VERIFICATION.md.

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all deliverables — all shipped in Phase 1 PR (5ef7035)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (quick: ~30s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-17

---

## Validation Audit 2026-04-17

| Metric | Count |
|--------|-------|
| Requirements audited | 14 |
| Gaps found | 0 |
| Resolved by auditor | 0 |
| Escalated to manual-only | 0 |
| COVERED | 10 |
| MANUAL (pre-existing) | 4 |

**Notes:**
- VALIDATION.md was a pre-execution template; all Task IDs, file-exists flags, and statuses updated to reflect post-execution reality.
- `publish-metadata.test.ts` runs green: 164 tests passing.
- GATE-01 (`pnpm check`) was green at Phase 1 completion; a post-Phase-1 ESLint error in `pipeline-epipe.test.ts` (introduced in Phase 2-3) is out-of-scope for this audit.
- `SECURITY.md` is locally deleted (unstaged) — introduced in a later phase; was committed and present at Phase 1 PR merge (5ef7035).
