---
status: partial
phase: 08-formal-verification-foundation-setup
source: [08-VERIFICATION.md]
started: 2026-04-18T23:03:19Z
updated: 2026-04-18T23:03:19Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Firebase project creation via `dtc setup firebase`

expected: Run `dtc setup firebase` "create new project" branch with a real Google account (logged in via `firebase login --no-localhost`). Provide a unique project ID. New Firebase project appears in Firebase Console; iOS app registered; `GoogleService-Info.plist` downloaded into the project tree; `~/.dtc/config.json` updated with `project.firebaseProjectId`. On conflict, subprocess error surfaces verbatim.
result: [pending]

**Note:** This is an inherited checkpoint from Phase 3 (SETUP-04 task 03-04-T2). Phase 8's own verification work (all 8/8 must-haves) is complete. Only this live Firebase step remains outstanding.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
