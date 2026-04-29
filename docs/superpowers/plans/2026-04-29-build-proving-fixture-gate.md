# Build-Proving Fixture Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PR-safe tiny SwiftUI fixture gate prove that fixture replay generates a buildable app and diagnosable run state.

**Architecture:** Add a focused Node verifier under `scripts/` that inspects `fixtures/tiny-mock/out` after the pipeline runs. The GitHub Actions E2E job keeps running the normal CLI, then invokes the verifier and uploads diagnostic artifacts on failure. Unit tests cover verifier failure modes without re-running the pipeline.

**Tech Stack:** Node.js ESM script, Vitest, GitHub Actions, pnpm, existing fixture pipeline.

---

## File Structure

- Create `scripts/verify-tiny-mock-output.mjs`: command-line verifier for generated fixture output.
- Create `__tests__/verify-tiny-mock-output.test.ts`: focused tests that run the verifier against temporary generated-output trees.
- Modify `.github/workflows/e2e.yml`: require actual pipeline success, invoke verifier, upload failure artifacts.
- Modify `fixtures/tiny-mock/README.md`: document strict local reproduction.

## Task 1: Add Failing Verifier Tests

**Files:**
- Create: `__tests__/verify-tiny-mock-output.test.ts`
- Create later: `scripts/verify-tiny-mock-output.mjs`

- [ ] **Step 1: Write tests for verifier success and failure messages**

Create `__tests__/verify-tiny-mock-output.test.ts` with tests that:

- Build a temporary fixture output tree with `project.yml`, `App.xcodeproj`, Swift sources, `.dtc/run-context.json`, and `report.json`.
- Assert the verifier exits `0` for the valid tree.
- Assert the verifier exits non-zero and names the missing file when `project.yml` is absent.
- Assert the verifier exits non-zero when generated files contain credential-like content.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `pnpm exec vitest run __tests__/verify-tiny-mock-output.test.ts`

Expected: FAIL because `scripts/verify-tiny-mock-output.mjs` does not exist yet.

## Task 2: Implement Fixture Output Verifier

**Files:**
- Create: `scripts/verify-tiny-mock-output.mjs`
- Test: `__tests__/verify-tiny-mock-output.test.ts`

- [ ] **Step 1: Implement CLI parsing and output-root validation**

The script should accept `--out <path>`, print usage and exit `2` for invalid arguments, and resolve the output root from the current working directory.

- [ ] **Step 2: Implement required file checks**

Required paths:

- `.dtc/run-context.json`
- `project.yml`
- `App.xcodeproj`
- at least one `.swift` file under the output tree

`report.json` should be accepted when present, but not required because failed builds may stop before report generation.

- [ ] **Step 3: Implement run-context parsing**

Parse `.dtc/run-context.json` as JSON and fail if it is invalid or lacks `runId`, `platform`, or an array-like/object-like phase record.

- [ ] **Step 4: Implement secret hygiene checks**

Scan generated text files for obvious credential leaks:

- `-----BEGIN PRIVATE KEY-----`
- `APPLE_ID_PASSWORD`
- `ASC_PRIVATE_KEY`
- `FIREBASE_PRIVATE_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS=`
- `ANTHROPIC_API_KEY=`
- `OPENAI_API_KEY=`
- `GEMINI_API_KEY=`

Skip binary-looking files and large files over 1 MiB.

- [ ] **Step 5: Run tests and make them pass**

Run: `pnpm exec vitest run __tests__/verify-tiny-mock-output.test.ts`

Expected: PASS.

## Task 3: Wire Verifier Into E2E Workflow

**Files:**
- Modify: `.github/workflows/e2e.yml`
- Modify: `fixtures/tiny-mock/README.md`

- [ ] **Step 1: Remove the Build-phase log override**

Change `e2e-build` so the fixture pipeline command is allowed to fail the job directly. Preserve log capture with `tee`.

- [ ] **Step 2: Invoke the verifier after the fixture pipeline**

Run `node scripts/verify-tiny-mock-output.mjs --out fixtures/tiny-mock/out` after the fixture pipeline exits successfully.

- [ ] **Step 3: Upload diagnostics on failure**

Add `actions/upload-artifact@v4` with `if: failure()` and paths:

- `/tmp/pipeline.log`
- `fixtures/tiny-mock/out/.dtc/**`
- `fixtures/tiny-mock/out/.dtc-debug/**`
- `fixtures/tiny-mock/out/project.yml`
- `fixtures/tiny-mock/out/App.xcodeproj/**`

- [ ] **Step 4: Document local reproduction**

Update `fixtures/tiny-mock/README.md` with the strict local command:

```bash
DTC_LLM_MODE=fixture node cli/dist/entry.js run \
  --design-ir fixtures/tiny-mock/design-ir.json \
  --platform swiftui --baas mock \
  --no-upload --skip-simulator --ci \
  --out fixtures/tiny-mock/out

node scripts/verify-tiny-mock-output.mjs --out fixtures/tiny-mock/out
```

## Task 4: Verify

**Files:**
- All changed files

- [ ] **Step 1: Run focused verifier tests**

Run: `pnpm exec vitest run __tests__/verify-tiny-mock-output.test.ts`

Expected: PASS.

- [ ] **Step 2: Run typecheck/lint where relevant**

Run: `pnpm lint`

Expected: PASS or existing unrelated warnings only.

- [ ] **Step 3: Inspect final diff**

Run: `git diff --stat` and `git diff --check`

Expected: only planned files changed and no whitespace errors.
