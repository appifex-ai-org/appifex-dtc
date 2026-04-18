# Phase 8: Formal Verification — Foundation Hardening & Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 08-formal-verification-foundation-setup
**Areas discussed:** Evidence gathering, SETUP-04 open item, Verification depth

---

## Evidence Gathering

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run tests first | Plan includes `pnpm test` as step 1 — captures current green count + any regressions; evidence cites live output | ✓ |
| Analytical only | Trust VALIDATION.md records; read source files + SUMMARY.md without re-executing | |
| Hybrid: targeted tests only | Run only the specific test files for each requirement | |

**User's choice:** Re-run tests first
**Notes:** Evidence in VERIFICATION.md must cite current test output, not prior records.

---

## SETUP-04 Open Item

| Option | Description | Selected |
|--------|-------------|----------|
| Not done — mark human_needed | 03-VERIFICATION.md carries SETUP-04 as human_needed; code-level verified, live test deferred | ✓ |
| Done manually already | Mark SETUP-04 fully verified with confirmation note | |

**User's choice:** Not done — mark human_needed
**Notes:** Follow Phase 1 GATE-02/03 pattern. Full code-level score, human_verification section with exact manual steps.

---

## Verification Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full depth — match Phase 1 | Read source files directly: commit hashes, line numbers, test counts; each requirement row cites concrete code evidence | ✓ |
| Summary depth | Cite SUMMARY.md and VALIDATION.md artifacts without re-reading every source file | |

**User's choice:** Full depth — match Phase 1
**Notes:** Each requirement evidence string should include test file name, assertion count, and commit hash where relevant.

---

## Claude's Discretion

- YAML frontmatter format: match Phase 1 exactly
- Score format for Phase 3: `N/N requirements verified in code + 0/1 human checkpoint pending`
- REQUIREMENTS.md update approach: mark FOUND-01..04 as Verified; SETUP-01..04 as Verified (code-level; SETUP-04 human step pending)

## Deferred Ideas

None.
