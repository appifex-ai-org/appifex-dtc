# Phase 8: Formal Verification — Foundation Hardening & Setup - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 3 (2 new VERIFICATION.md documents + 1 REQUIREMENTS.md update)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/phases/02-foundation-hardening/02-VERIFICATION.md` | verification-doc | transform (evidence → verdict) | `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` | exact |
| `.planning/phases/03-setup-and-diagnostics/03-VERIFICATION.md` | verification-doc | transform (evidence → verdict) | `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` | exact |
| `.planning/REQUIREMENTS.md` | traceability-table | CRUD (update status rows) | `.planning/REQUIREMENTS.md` (self) | exact |

---

## Pattern Assignments

### `.planning/phases/02-foundation-hardening/02-VERIFICATION.md` (verification-doc, transform)

**Analog:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md`

**YAML frontmatter pattern** (analog lines 1–24):
```yaml
---
phase: 02-foundation-hardening
verified: <ISO-8601 timestamp of verification run>
status: passed
score: 4/4 requirements verified in code
overrides_applied: 0
---
```

Fields required per D-01 (Claude's Discretion): `phase`, `verified`, `status`, `score`, `overrides_applied`.
No `human_verification` block needed for Phase 2 (all requirements fully automated; no deferred live steps).
No `re_verified_live` field unless a re-verification run happens.

**Document header pattern** (analog lines 46–51):
```markdown
# Phase 2: Foundation Hardening Verification Report

**Phase Goal:** Harden the CLI binary launcher, token budget enforcement, EPIPE error propagation, and subprocess isolation so a crashed pipeline never kills the MCP host.
**Verified:** <same timestamp as frontmatter>
**Status:** passed
```

**Requirements coverage table pattern** (analog lines 65–79):
```markdown
## Goal Achievement

### Requirements Coverage

| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | FOUND-01 | `bin/dtc` portable launcher | PASS | <concrete evidence: test file, assertion count, commit> |
| 2 | FOUND-02 | Token estimator Swift density + 30% reserve | PASS | <concrete evidence> |
| 3 | FOUND-03 | Pipeline hard-fails on EPIPE | PASS | <concrete evidence> |
| 4 | FOUND-04 | Subprocess boundary — process.exit can't kill MCP host | PASS | <concrete evidence> |
```

Evidence strings MUST follow this pattern from the analog: cite test file name, assertion count, commit hash, and key grep result. Example from analog row 11:
`"Plan 01-11 added in-repo changeset-check job to ci.yml: PR-gated (if: github.event_name == 'pull_request'), uses git diff --diff-filter=A ... REQUIRED_CONTEXTS line 111 carries 'changeset-check' uncommented."`

**Required artifacts table pattern** (analog lines 83–102):
```markdown
### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/core/src/errors.ts` | VERIFIED | CliError base + 5 subclasses (PreflightError, ConfigError, ResumeAbortError, BudgetExhaustedError, EpipeError) |
| `cli/__tests__/bin-dtc-launcher.test.ts` | VERIFIED | spawn bin/dtc --help, assert exit 0 |
| ... | ... | ... |
```

**Behavioral spot-checks table pattern** (analog lines 104–117):
```markdown
### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `pnpm test` | <N> files / <M> passed / <K> skipped | PASS |
| Phase 2 targeted tests | `pnpm vitest run cli/__tests__/bin-dtc-launcher.test.ts packages/...` | 12 files / 48 passed | PASS |
| bin/dtc exits 0 | `./bin/dtc --help` | exits 0, prints "dtc — Design-to-Code Toolkit" | PASS |
| EPIPE guard | `grep -l 'EpipeError' cli/src/pipeline.ts packages/codegen/src/... packages/fix/src/...` | 4 files | PASS |
```

**Verdict / gaps pattern** (analog lines 147–162):
```markdown
### Gaps Summary

**Zero code-level gaps remain.** All 4 requirements are satisfied in the repository...

### Verdict

**GOAL_ACHIEVED** — the repository contains every artifact, wiring, and test required by the phase goal.

Status is `passed`.
```

**Phase 2 evidence map** (from `02-VALIDATION.md` and `02-01-SUMMARY.md` through `02-05-SUMMARY.md`):

| REQ-ID | Test files | Assertion count | Key commits |
|--------|-----------|-----------------|-------------|
| FOUND-01 | `cli/__tests__/bin-dtc-launcher.test.ts`, `__tests__/prepare-hook.test.ts` | part of 48 total | commits per 02-05-SUMMARY |
| FOUND-02 | `packages/analysis/__tests__/token-cap.test.ts`, `packages/core/__tests__/token-budget.test.ts`, `packages/fix/__tests__/fix-loop-budget-guard.test.ts` | part of 48 total | commits per 02-02-SUMMARY |
| FOUND-03 | `cli/__tests__/pipeline-epipe.test.ts`, `packages/codegen/__tests__/claude-cli-epipe.test.ts`, `packages/fix/__tests__/claude-cli-fix-epipe.test.ts`, `packages/agent/__tests__/base-adapter-epipe.test.ts` | part of 48 total | commits per 02-03-SUMMARY |
| FOUND-04 | `cli/__tests__/preflight.test.ts`, `packages/mcp-server/__tests__/cli-error-translation.test.ts`, `cli/__tests__/entry-error-handling.test.ts` | 12 assertions (02-01-SUMMARY confirmed) | `bec8d15`, `565021a`, `ae05ed6`, `54387dd` |

Validation audit (02-VALIDATION.md lines 106–134) confirms: **12 test files, 48 assertions, 1.01s**, all green on 2026-04-17.

---

### `.planning/phases/03-setup-and-diagnostics/03-VERIFICATION.md` (verification-doc, transform)

**Analog:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md`

**YAML frontmatter pattern** — Phase 3 has a deferred manual step, so follows the `human_needed` variant:
```yaml
---
phase: 03-setup-and-diagnostics
verified: <ISO-8601 timestamp>
status: human_needed
score: 4/4 requirements verified in code + 0/1 human checkpoint pending
overrides_applied: 0
human_verification:
  - test: "Run `dtc setup firebase` 'create new project' branch with a real Google account + real GCP billing account"
    expected: "New Firebase project created, iOS app registered, GoogleService-Info.plist downloaded to project tree, config saved. Subprocess errors surface verbatim on conflict."
    why_human: "Requires live firebase CLI login and real GCP billing account. Task 03-04-T2 was explicitly designated as a human-verify checkpoint in the plan — cannot be automated in CI."
---
```

Fields: `phase`, `verified`, `status`, `score`, `overrides_applied`, `human_verification` array.
Score format per D-02 (Claude's Discretion): `"4/4 requirements verified in code + 0/1 human checkpoint pending"`.
`human_verification` structure mirrors analog lines 34–43: `test`, `expected`, `why_human` fields.

**Document header pattern**:
```markdown
# Phase 3: Setup & Diagnostics Verification Report

**Phase Goal:** Deliver an end-to-end `dtc setup --full` wizard, credential gate in preflight, `dtc doctor` enhanced checks, and Firebase project provisioning — all before any LLM spend.
**Verified:** <same timestamp as frontmatter>
**Status:** human_needed (all code-level requirements PASS; Firebase live-project creation deferred to user)
```

**Requirements coverage table pattern** — SETUP-04 row must use `PASS (code-level)` status with inline note:
```markdown
| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | SETUP-01 | `dtc setup --full` wizard end-to-end | PASS | <evidence: setup section files, test file, assertion count, commit> |
| 2 | SETUP-02 | CredentialRegistry fires before LLM spend | PASS | <evidence: preflight-credential-gate.test.ts, 5 integration tests, commit> |
| 3 | SETUP-03 | `dtc doctor` enhanced checks | PASS | <evidence: doctor.test.ts, prerequisites.ts, assertion count> |
| 4 | SETUP-04 | Wizard creates new Firebase project | PASS (code-level) | <code evidence: firebase.ts mocked subprocess tests, firebase-provision.test.ts>. Live Google OAuth flow deferred — see human_verification. |
```

**Human verification section pattern** (matches analog lines 128–145 section heading and prose):
```markdown
### Human Verification Required

1. **Real Firebase project creation via `dtc setup firebase`**
   - Test: Run `dtc setup firebase` "create new project" branch with a real Google account (logged in via `firebase login --no-localhost`). Provide a unique project ID.
   - Expected: New Firebase project appears in Firebase Console; iOS app registered; `GoogleService-Info.plist` downloaded into the project tree; `~/.dtc/config.json` updated with `project.firebaseProjectId`. On conflict, subprocess error surfaces verbatim.
   - Why human: Requires live Firebase CLI login and real GCP billing account. 03-04-T2 was explicitly designated as a human-verify checkpoint.
```

**Phase 3 evidence map** (from `03-VALIDATION.md`):

| REQ-ID | Test files | Assertion count | Key source files |
|--------|-----------|-----------------|-----------------|
| SETUP-01 | `cli/__tests__/setup-wizard.test.ts`, `cli/__tests__/setup-sections.test.ts` | part of 55 total | `cli/src/setup/index.ts`, `cli/src/setup/project.ts`, + 7 section files |
| SETUP-02 | `cli/__tests__/preflight-credential-gate.test.ts` (5 integration tests), `packages/core/__tests__/credential-registry.test.ts`, `packages/core/__tests__/asc-jwt.test.ts`, `packages/core/__tests__/config-permissions.test.ts` | part of 55 total | `packages/core/src/credential-registry.ts`, `packages/core/src/asc-jwt.ts`, `cli/src/preflight.ts` |
| SETUP-03 | `cli/__tests__/doctor.test.ts` | part of 55 total | `cli/src/doctor.ts`, `packages/core/src/prerequisites.ts` |
| SETUP-04 | `cli/__tests__/setup-firebase.test.ts`, `packages/baas/__tests__/firebase-provision.test.ts` (stub) | part of 55 total | `cli/src/setup/firebase.ts` |

Validation audit (03-VALIDATION.md lines 98–112) confirms: **55 tests passing, 0 todos**, green on 2026-04-16.

UAT (03-UAT.md): 7 passed / 1 skipped (test 5: Firebase live — manual-only per plan). UAT inline fix: `entry.ts` missing `await` before `runPreflight` — fixed in commit `976cfe7`.

---

### `.planning/REQUIREMENTS.md` (traceability-table update)

**Analog:** Current `REQUIREMENTS.md` lines 102–148 (Traceability table)

**Table format** (lines 102–103):
```markdown
| REQ-ID | Phase | Status |
|--------|-------|--------|
```

**Rows to update** — change `| Pending |` to the new status values below:

```markdown
| FOUND-01 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-02 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-03 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-04 | Phase 2 → Phase 8 (gap closure) | Verified |
| SETUP-01 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-02 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-03 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-04 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
```

Per D-02 (Claude's Discretion): FOUND-01..04 are fully verified (no human steps). SETUP-01..04 all carry the parenthetical because SETUP-04's live Firebase step is outstanding and that step touches the same setup flow as SETUP-01..03.

Current lines to overwrite (REQUIREMENTS.md lines 115–122):
```
| FOUND-01 | Phase 2 → Phase 8 (gap closure) | Pending |
| FOUND-02 | Phase 2 → Phase 8 (gap closure) | Pending |
| FOUND-03 | Phase 2 → Phase 8 (gap closure) | Pending |
| FOUND-04 | Phase 2 → Phase 8 (gap closure) | Pending |
| SETUP-01 | Phase 3 → Phase 8 (gap closure) | Pending |
| SETUP-02 | Phase 3 → Phase 8 (gap closure) | Pending |
| SETUP-03 | Phase 3 → Phase 8 (gap closure) | Pending |
| SETUP-04 | Phase 3 → Phase 8 (gap closure) | Pending |
```

---

## Shared Patterns

### Frontmatter `status` field values
**Source:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` lines 5, 51
**Apply to:** Both new VERIFICATION.md files

- `passed` — when all requirements fully verified in code AND no human steps outstanding
- `human_needed` — when all code-level requirements PASS but ≥1 human checkpoint is deferred

Phase 2 → `passed`. Phase 3 → `human_needed`.

### Evidence citation format
**Source:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` lines 67–79
**Apply to:** All requirements table rows in both new files

Each Evidence cell must cite: test file name(s) + assertion count + commit hash (where available) + a key grep/structural check result. Never cite SUMMARY.md alone — read source files directly per D-03.

### Score format
**Source:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` line 7
**Apply to:** Both new VERIFICATION.md frontmatters

- Phase 2: `"4/4 requirements verified in code"`
- Phase 3: `"4/4 requirements verified in code + 0/1 human checkpoint pending"`

### `pnpm test` live re-run requirement
**Source:** D-01 (08-CONTEXT.md lines 18–20)
**Apply to:** Both VERIFICATION.md behavioral spot-checks tables

The verifier agent MUST run `pnpm test` at execution start and cite the live output (file count + passed count + skipped count) in the spot-checks table. Do not copy counts from VALIDATION.md alone.

### Anti-patterns / overrides section
**Source:** `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` lines 119–127
**Apply to:** Both new VERIFICATION.md files

Include an "Anti-Patterns Found" table even if empty or info-only. Use columns: `File | Pattern | Severity | Impact`.

---

## No Analog Found

None — all three output files have exact analogs in the codebase.

---

## Metadata

**Analog search scope:** `.planning/phases/01-open-source-release-readiness/`, `.planning/phases/02-foundation-hardening/`, `.planning/phases/03-setup-and-diagnostics/`, `.planning/REQUIREMENTS.md`
**Files scanned:** 7 (VERIFICATION.md analog, 02-VALIDATION.md, 02-UAT.md, 02-01-SUMMARY.md, 03-VALIDATION.md, 03-UAT.md, REQUIREMENTS.md)
**Pattern extraction date:** 2026-04-19
