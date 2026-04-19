# Phase 8: Formal Verification — Foundation Hardening & Setup - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce `02-VERIFICATION.md` and `03-VERIFICATION.md` — formal documents that prove Phase 2 (Foundation Hardening) and Phase 3 (Setup & Diagnostics) satisfy all their success criteria. Update REQUIREMENTS.md to mark FOUND-01..04 and SETUP-01..04 as Verified.

New code is out of scope. This phase is purely analytical + documentary.

</domain>

<decisions>
## Implementation Decisions

### Evidence Gathering
- **D-01:** Re-run `pnpm test` as step 1 of execution to capture a live green count and surface any regressions. Evidence in VERIFICATION.md must cite current test output, not just prior VALIDATION.md records.

### SETUP-04 Manual Checkpoint
- **D-02:** The Phase 3 manual check 03-04-T2 (Firebase project creation with live Google OAuth account) has NOT been done. `03-VERIFICATION.md` must carry SETUP-04 as `human_needed` — code-level verified, live Firebase flow deferred to human. Follow the Phase 1 GATE-02/03 pattern: full code-level score with a `human_verification` section documenting the exact manual steps needed.

### Verification Depth
- **D-03:** Full depth — match Phase 1 VERIFICATION.md quality. The verification agent reads source files directly: extracts commit hashes, line numbers, test file names and assertion counts. Each requirement row in the evidence table cites concrete code evidence. Do not summarize from SUMMARY.md alone.

### Claude's Discretion
- Format: Follow Phase 1 VERIFICATION.md YAML frontmatter structure exactly (`phase`, `verified`, `status`, `score`, `human_verification`, `overrides_applied`).
- Score format: `N/N requirements verified in code + 0/1 human checkpoint pending` for Phase 3.
- REQUIREMENTS.md update: Mark FOUND-01..04 as `Verified` and SETUP-01..04 as `Verified (code-level; SETUP-04 human step pending)`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model
- `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` — Canonical format model. Exact YAML frontmatter, requirements table, artifacts table, human_verification section structure to replicate for Phase 8 outputs.

### Phase 2 Evidence Sources
- `.planning/phases/02-foundation-hardening/02-VALIDATION.md` — Per-task verification map; all tasks green. Contains test commands and file names for each FOUND-* requirement.
- `.planning/phases/02-foundation-hardening/02-UAT.md` — UAT results (status: complete).
- `.planning/phases/02-foundation-hardening/02-01-SUMMARY.md` through `02-05-SUMMARY.md` — Per-plan summaries with commit references.

### Phase 3 Evidence Sources
- `.planning/phases/03-setup-and-diagnostics/03-VALIDATION.md` — Per-task verification map; all automated tasks green; 03-04-T2 pending manual.
- `.planning/phases/03-setup-and-diagnostics/03-UAT.md` — UAT results (status: complete).
- `.planning/phases/03-setup-and-diagnostics/03-01-SUMMARY.md` through `03-05-SUMMARY.md` — Per-plan summaries with commit references.

### Requirements
- `.planning/REQUIREMENTS.md` — Traceability table to update (FOUND-01..04, SETUP-01..04 rows).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 VERIFICATION.md at `.planning/phases/01-open-source-release-readiness/VERIFICATION.md` is the direct template for the output format.

### Established Patterns
- `human_needed` status pattern: established in Phase 1 for code-verified-but-live-unconfirmed items. Apply same to SETUP-04 in `03-VERIFICATION.md`.
- Requirement evidence format: "REQ-ID | Description | Status | Evidence" table with inline evidence strings including test file names, assertion counts, commit hashes.

### Integration Points
- REQUIREMENTS.md traceability table at bottom of file: rows for FOUND-01..04 and SETUP-01..04 need `| Verified |` status update.

</code_context>

<specifics>
## Specific Ideas

- No specific references beyond the Phase 1 model — open to standard approaches within that format.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-formal-verification-foundation-setup*
*Context gathered: 2026-04-19*
