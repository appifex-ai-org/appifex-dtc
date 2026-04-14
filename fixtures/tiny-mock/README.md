# fixtures/tiny-mock

Hermetic fixture for GATE-02 E2E smoke gate (Phase 1 Plan 07, D-08).

## Contents

- `design.pen` — **placeholder only.** The live offline spike (open question A2) was not executed in this plan; see "Offline spike result" below. Replace with a real `.pen` file once Pencil MCP is available, then refresh `design-ir.json` via the regeneration steps.
- `design-ir.json` — pre-extracted `PlatformSpec` + `DesignTokens` + metadata. This is the authoritative input to CI when using the `--design-ir` fallback path. Hand-authored for the tiny-mock fixture; matches the shape produced by `packages/spec/src/translate.ts`.
- `mock-baas-config.json` — hermetic mock backend config (no Firebase creds required).
- `maestro/login-flow.yml` — golden-path Maestro test (sign-in + list items).

## Fixture shape

Two screens:

1. **Login** — title "Sign In", `Email` text field, `Password` secure field, `Sign In` button.
2. **Home** — title "Items", list with three mock items ("First item", "Second item", "Third item").

## How to regenerate

1. While online, with Pencil MCP available, recreate the `.pen`:
   ```bash
   # via Claude with Pencil MCP tools loaded
   open_document('new')
   batch_design(...)   # see fixture shape above
   # save to fixtures/tiny-mock/design.pen
   ```
2. Re-extract the IR JSON to keep `--design-ir` in sync:
   ```bash
   node scripts/extract-fixture-ir.mjs fixtures/tiny-mock/design.pen \
     > fixtures/tiny-mock/design-ir.json
   ```
   (One-off script; create on demand by importing `@appifex/design` + `@appifex/spec`.)

## Mock BaaS shape

`mock-baas-config.json` declares an `email` auth provider and a single `items` collection (`id`, `title`). The shape mirrors the existing `@appifex/baas` mock provider templates under `packages/baas/src/templates/mock/`.

## CI usage

`.github/workflows/e2e.yml` runs both jobs (`e2e-build` on PR, `e2e-simulator` on push) using `--design-ir fixtures/tiny-mock/design-ir.json` per the spike fallback path documented below.

**Outcome:** (b) — **partial offline** (live-verified 2026-04-15 against a real `helloworld.pen` with WiFi off).

What works offline:
- Pencil MCP stdio server starts and parses the `.pen` file
- `design` phase completes
- `spec` phase translates to `PlatformSpec`
- `baas-recommend` phase runs heuristics

What fails offline:
- `baas-schema` phase (needs `claude --print` → `ConnectionRefused`)
- All downstream phases that invoke the LLM (codegen, fix, validate)

**Implication for CI:** `--design-ir` is still the right call for GitHub-hosted runners, not because Pencil is incapable, but because (1) installing + authenticating the Pencil MCP binary in CI is extra friction we don't need, and (2) the pipeline fails on schema-inference anyway unless real LLM creds are wired. The `e2e-build` / `e2e-simulator` jobs in `.github/workflows/e2e.yml` will therefore need either `ANTHROPIC_API_KEY` set as a secret OR a future `--mock-llm` mode before GATE-02 is truly green end-to-end. Tracked as a Phase 2 follow-up.

## Offline spike result: (b) — live-verified; --design-ir fallback retained for CI hermeticity.
