# Build-Proving Fixture Gate Design

Date: 2026-04-29

## Goal

Improve PR-safe reliability for the SwiftUI fixture path by making CI prove that `dtc run` generates a buildable app, not only that the pipeline reaches the Build phase.

The target user promise is "Design to TestFlight in one command." This design focuses on the CI-repeatable subset of that promise: design IR plus fixture LLM replay should produce a SwiftUI project that passes the local build and emits diagnosable pipeline state without spending tokens or requiring Apple/Firebase credentials.

## Scope

- Strengthen the existing macOS `e2e-build` workflow for `fixtures/tiny-mock`.
- Keep the gate hermetic with `DTC_LLM_MODE=fixture`, committed design IR, and committed LLM cassettes.
- Require a clean fixture pipeline/build result instead of accepting "Build phase reached" as success.
- Verify generated output after the run with a small harness or script outside production pipeline logic.
- Upload useful diagnostics on failure, including pipeline logs, `.dtc` state, `.dtc-debug` state when present, and generated project metadata.
- Add focused contract tests where they help distinguish fixture drift from build invocation or report interpretation failures.

## Non-Goals

- No live Firebase project creation in PR CI.
- No real TestFlight upload in PR CI.
- No Apple Developer account dependency in PR CI.
- No broad `cli/src/pipeline.ts` refactor.
- No LLM provider architecture cleanup unless it is directly required for fixture determinism.
- No simulator requirement for every PR beyond the existing push-only simulator job.

## Architecture

The production pipeline should keep emitting normal outputs. CI should verify those outputs from the outside so test-only expectations do not leak into `dtc run`.

The main pieces are:

- Fixture pipeline run: the existing `.github/workflows/e2e.yml` PR job invokes `node cli/dist/entry.js run` against `fixtures/tiny-mock/design-ir.json`.
- Generated-app verifier: a repo-owned script or Vitest helper reads `fixtures/tiny-mock/out` after the run and checks expected files, metadata, and run state.
- Build proof: CI success requires the pipeline/build command to exit cleanly.
- Artifact capture: failed runs upload the pipeline log and generated `.dtc` state so regressions can be diagnosed without immediate local reproduction.

The boundary is deliberate: pipeline produces files and reports; CI verifies them.

## Components

### Workflow Gate

Update the `e2e-build` job so the fixture run exits with the actual pipeline status. Remove the current override that treats the job as successful when the log merely shows the Build phase was reached.

The workflow should still run on pull requests and pushes to `main` and `develop`, still use macOS, still install `xcodegen`, and still use fixture LLM mode.

### Generated Tree Verifier

Add a small verifier that inspects the generated fixture output. It should fail with direct messages when required files or states are missing.

Initial checks:

- Generated project directory exists under `fixtures/tiny-mock/out`.
- Expected Swift source files exist.
- Xcode project metadata exists after `xcodegen` runs.
- `.dtc/run-context.json` exists and is parseable.
- Report output exists if the pipeline reaches report generation.
- Fixture-mode token/cost behavior is visible in run state or progress-derived artifacts where already recorded.
- Generated files do not contain obvious credential material or fixture-forbidden secret fields.

The verifier should not duplicate Xcode's compiler. Compilation stays the build phase's responsibility.

### Diagnostic Artifacts

On failure, upload:

- `/tmp/pipeline.log` or the workflow-local pipeline log.
- `fixtures/tiny-mock/out/.dtc`.
- `fixtures/tiny-mock/out/.dtc-debug` when present.
- Generated project config files that are safe to expose in CI artifacts.

The artifact step should run with `if: failure()` or equivalent and should not mask the failing status.

### Focused Contract Tests

Add lightweight tests only where they improve diagnostics for the E2E gate:

- Run-context parsing for expected terminal phase states.
- Verifier failure messages for missing generated files.
- Report/build result interpretation if existing helpers make that cheap.

These tests should avoid re-running the full pipeline.

## Data Flow

1. CI checks out the repo and installs dependencies.
2. CI builds workspace packages.
3. CI runs the tiny fixture pipeline in fixture LLM mode.
4. The pipeline writes generated app output and `.dtc` state.
5. The verifier inspects generated output and run state.
6. If any step fails, CI uploads diagnostics and fails the job.

## Error Handling

The workflow should fail closed:

- A non-zero fixture pipeline exit is a CI failure.
- A missing required generated file is a CI failure.
- Missing or invalid `.dtc/run-context.json` is a CI failure.
- Fixture verifier failures should print concise remediation context, such as "fixture drift", "generated project missing", or "build did not complete".

If the current cassette cannot produce a buildable project, that is treated as signal. The follow-up should update the cassette/golden fixture or explicitly split out a temporary known-failing issue. The workflow should not silently accept a failed build.

## Testing

Verification layers:

- `pnpm test` covers the verifier and any contract tests.
- `pnpm build` ensures the verifier can be used from compiled JS if it is a TypeScript package entry or script.
- The macOS `e2e-build` workflow runs the fixture pipeline and verifier.
- The existing push-only simulator job remains available for deeper validation.

Local reproduction should be documented near the fixture or workflow. The command should include the same `DTC_LLM_MODE=fixture`, `--design-ir`, `--platform swiftui`, `--baas mock`, `--no-upload`, `--skip-simulator`, and `--ci` options used by the PR job.

## Rollout Plan

1. Add the generated-app verifier and focused tests.
2. Update `.github/workflows/e2e.yml` so `e2e-build` requires a clean pipeline exit and invokes the verifier.
3. Add diagnostic artifact upload on failure.
4. Run local tests and build.
5. Run the fixture locally when the machine has the required Xcode and `xcodegen` setup.
6. If the fixture fails because the committed cassette is stale, update the fixture as part of the implementation work rather than weakening the gate.

## Success Criteria

- A PR that breaks fixture replay, generated Swift compilation, required generated project structure, or `.dtc` run-state writing fails in CI.
- The CI job spends zero LLM tokens.
- The CI job does not require Apple or Firebase credentials.
- Failure artifacts contain enough state to distinguish fixture drift from generation, build, or verifier problems.
- Production pipeline code remains free of CI-only assertions.
