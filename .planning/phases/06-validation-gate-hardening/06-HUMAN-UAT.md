---
status: complete
phase: 06-validation-gate-hardening
source: [06-VERIFICATION.md]
started: 2026-04-18T08:15:00Z
updated: 2026-04-18T10:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real Firebase golden-path simulator run
expected: `dtc` drives simulator through signup → Firestore write → Firestore read against the live dev Firebase project; `e2e_gate` phase exits 0; `testflight_upload` proceeds. Re-running produces `signIn_existingAccount` fall-through path.
result: pass

### 2. Maestro rerun idempotency (first-run signup, second-run signIn_existingAccount fallback)
expected: First run completes signup path; second run against same Firebase project taps the `signIn_existingAccount` affordance, logs in, continues to Firestore write/read.
result: pass

### 3. Anthropic tool-use against live API (not fixture)
expected: Fix loop sends `tools: [SUBMIT_FIXES_TOOL]` with `tool_choice: { type: 'tool', name: 'submit_fixes' }`, receives `content[].type === 'tool_use'` response, path-traversal guard applied to returned `fix.path` entries.
result: pass

### 4. --skip-validation-gate respects hard-fail invariant under live semgrep failure
expected: A seeded semgrep finding with `--skip-validation-gate` present → `xcode_archive` emits "Skipped — security hard-fail (no override)"; `testflight_upload` blocks. No `xcode_archive` run proceeds.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
