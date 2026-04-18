---
phase: 06
plan: 4
subsystem: baas-templates
tags: [accessibility, maestro, firebase, e2e-gate]
requires: [06-00]
provides:
  - signup-view.swift.eta.dismiss-env-var
  - signup-view.swift.eta.signIn_existingAccount-affordance
  - signup-view.swift.eta.signup_* a11y IDs
  - login-view.swift.eta.login_* a11y IDs
  - login-view.swift.eta.signUp_navigate a11y ID
affects:
  - packages/baas/src/templates/firebase/signup-view.swift.eta
  - packages/baas/src/templates/firebase/login-view.swift.eta
tech_stack:
  added: []
  patterns:
    - "SwiftUI @Environment(\\.dismiss) injection"
    - "Stable Maestro accessibilityIdentifier contract on generated auth views"
key_files:
  created: []
  modified:
    - packages/baas/src/templates/firebase/signup-view.swift.eta
    - packages/baas/src/templates/firebase/login-view.swift.eta
decisions:
  - "Apply a11y IDs directly to generated Firebase auth templates — honors D-05 recommendation to auto-inject rather than documenting as convention."
  - "Fall-through affordance gated by existing `if let error { }` branch — visible only on signup errors; zero UX impact on the happy path."
  - "Dismiss called via @Environment(\\.dismiss) (iOS 15+ API), consistent with the NavigationStack push that LoginView uses to show SignupView."
metrics:
  duration_minutes: 7
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_modified: 2
  completed_date: 2026-04-18
---

# Phase 6 Plan 4: Signup/Login Template Accessibility IDs Summary

**One-liner:** Baked the nine Maestro accessibility IDs (`signup_*`, `login_*`, `signUp_navigate`, `signIn_existingAccount`) into the generated Firebase auth templates and wired the D-05 "Sign in instead" fall-through affordance with a SwiftUI `@Environment(\.dismiss)` handler — making the e2e-gate golden-path flow portable across every generated app.

## Identifiers Added (9 total)

### signup-view.swift.eta (5)

| Identifier | Target view | Visibility |
|---|---|---|
| `signup_email` | `TextField("Email", …)` | Always |
| `signup_password` | `SecureField("Password", …)` | Always |
| `signup_confirmPassword` | `SecureField("Confirm password", …)` | Always |
| `signup_submit` | `Button(action: signUp) { … }` | Always |
| `signIn_existingAccount` | `Button("Sign in instead") { dismiss() }` | **Only when `error != nil`** |

### login-view.swift.eta (4)

| Identifier | Target view | Visibility |
|---|---|---|
| `login_email` | `TextField("Email", …)` | Always |
| `login_password` | `SecureField("Password", …)` | Always |
| `login_submit` | `Button(action: signIn) { … }` | Always |
| `signUp_navigate` | `NavigationLink { SignupView() } …` | Always |

## D-05 Affordance — Before / After (signup-view.swift.eta error block)

**Before:**

```swift
if let error {
    Text(error)
        .font(.caption)
        .foregroundColor(.red)
}
```

**After:**

```swift
if let error {
    Text(error)
        .font(.caption)
        .foregroundColor(.red)

    // Phase 6 (VAL-01 D-05): fall-through affordance for the e2e-gate flow.
    // Visible ONLY when signup failed — stable id so Maestro can detect + tap.
    Button("Sign in instead") {
        dismiss()
    }
    .accessibilityIdentifier("signIn_existingAccount")
    .buttonStyle(.borderless)
    .font(.footnote)
}
```

The button is gated by `if let error { … }` so it is invisible during a successful signup (happy-path UX unchanged) and visible only on the "email already in use" rerun surface — exactly what the Maestro YAML needs to tap-through on reruns.

## @Environment(\.dismiss) State Declaration

Added alongside the existing `@State` / `@StateObject` declarations in `SignupView`:

```swift
struct SignupView: View {
    @StateObject private var authManager = AuthManager.shared
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var error: String?
    @State private var isLoading = false
    @Environment(\.dismiss) private var dismiss // Phase 6 (VAL-01 D-05): dismiss for signIn_existingAccount affordance
```

`dismiss()` on iOS 15+ pops the SignupView off the NavigationStack (which `LoginView` pushed via its `NavigationLink { SignupView() }`), returning the user to the login surface where the Maestro flow can tap `login_submit` with the already-known credentials.

## Wave-0 Test Transition

`packages/baas/__tests__/signup-template-accessibility.test.ts` — RED → GREEN.

- Test 1 (`exposes signIn_existingAccount affordance`): PASS
- Test 2 (`exposes form-field accessibility IDs`): PASS

Total: 2/2 tests green. Full baas suite: 130/130 pass (14 test files, no regressions).

## Verification

- Wave-0 test: `pnpm vitest run packages/baas/__tests__/signup-template-accessibility.test.ts --bail=1` → 2/2 GREEN.
- Full baas suite: `pnpm vitest run packages/baas/__tests__ --bail=1` → 130/130 GREEN.
- `grep -c "// Phase 6 (VAL-01 D-05)" packages/baas/src/templates/firebase/signup-view.swift.eta` → 6 (≥5 required).
- `grep -c "// Phase 6 (VAL-01 D-05)" packages/baas/src/templates/firebase/login-view.swift.eta` → 4 (exactly 4 as planned).
- `wc -l packages/baas/src/templates/firebase/login-view.swift.eta` → 117 (original 113 + 4 new modifier lines; plan anticipated 118 based on `wc -l` returning 114, but the actual pre-state was 113; the delta of 4 added lines matches plan intent).
- No SSO / Forgot-password scope creep in login-view.

## Commits

| Task | Description | Hash |
|---|---|---|
| 1 | signup-view.swift.eta — dismiss env var, 4 signup_* IDs, signIn_existingAccount affordance | `fd2d504` |
| 2 | login-view.swift.eta — 3 login_* IDs + signUp_navigate | `b4d1f82` |

## Deviations from Plan

None functional. One cosmetic: the plan's `wc -l` acceptance criterion asserted 118 lines post-edit (based on an original count of 114) but the actual pre-edit file was 113 lines, yielding 117 post-edit. The count is one off from the criterion, but the 4-lines-added delta matches plan intent exactly and all 4 identifiers are placed on the correct anchor views. Treating this as a plan-side miscount, not a deviation in execution.

## Home / addItem Identifiers

Intentionally NOT added in this plan — per 06-RESEARCH they rely on codegen conventions (screen names, submit-button labels) rather than baked template strings. If the e2e-gate fails at those steps, that is a codegen-quality defect (Phase 7 DESIGN-* surface area), not a Phase 6 template concern.

## Threat-Flag Scan

None. The two modifier additions + one state field + one error-gated button are all within the existing trust boundary (generated SwiftUI → iOS app sandbox). No new network endpoints, auth paths, file access, or schema changes introduced.

## Self-Check: PASSED

- [x] `packages/baas/src/templates/firebase/signup-view.swift.eta` — FOUND, contains all 5 required identifiers + dismiss env var.
- [x] `packages/baas/src/templates/firebase/login-view.swift.eta` — FOUND, contains all 4 required identifiers.
- [x] Commit `fd2d504` (Task 1) — FOUND on branch `worktree-agent-a10be232`.
- [x] Commit `b4d1f82` (Task 2) — FOUND on branch `worktree-agent-a10be232`.
- [x] Wave-0 `signup-template-accessibility.test.ts` — GREEN (2/2).
- [x] Full baas suite — GREEN (130/130).

## TDD Gate Compliance

Plan frontmatter declares `type: execute`, not `type: tdd`, so plan-level TDD gate validation does not apply. Per-task `tdd="true"` was honored: Wave-0 RED test (`signup-template-accessibility.test.ts`) was pre-committed upstream in the 06-00 Wave-0 RED-stubs commit (`f6a0c45`); this plan provided the GREEN implementation.
