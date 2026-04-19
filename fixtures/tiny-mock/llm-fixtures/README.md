# tiny-mock LLM fixtures

Committed cassettes that back `DTC_LLM_MODE=fixture`. When the env var is set,
every LLM intercept site in the tiny-mock pipeline short-circuits to the JSON
file here matching its phase key — no network, no tokens, deterministic.

See `packages/core/src/llm-fixture.ts` for the loader and
`.github/workflows/e2e.yml` for the CI wiring (Phase 1 Plan 01-10, GATE-02).

## Cassette format

Every file is a `FixtureResponse`:

```json
{
  "content": [{ "type": "text", "text": "<raw LLM output>" }],
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

The `text` field is the exact string the downstream parser in the pipeline
would have received from a real model. The response shape is deliberately the
Anthropic `Message` subset already used across the codebase.

## Keys (one file per LLM call site the tiny-mock pipeline hits)

- `baas-schema.json` — response to `SCHEMA_INFERENCE_PROMPT`. The `text` field
  MUST decode via `packages/baas/src/infer-schema.ts::parseSchemaJson`: every
  entity PascalCase, every entity carries an `ownerId: string` (required), and
  every field type is one of `string|number|boolean|date|reference|array`.
- `codegen.json` — response for the default + layered codegen fallbacks. The
  `text` field uses the `===FILE:<path>===<body>===END_FILE===` delimiter
  format parsed by `packages/codegen/src/default-generate.ts::parseDelimitedFiles`.
  Every `assertVisible` id in `fixtures/tiny-mock/maestro/login-flow.yml`
  (`Sign In`, `Email`, `Password`, `Items`) MUST appear as an
  `.accessibilityIdentifier(...)` on a leaf SwiftUI view.
- `fix.json` — response for the fix loop. The empty (no `===FIX:` blocks) body
  shipped today lets the loop exit cleanly when first-compile succeeds. If a
  future pipeline drift triggers real fix-loop runs, replace with a richer
  cassette containing `===FIX: path===body===END_FIX===` blocks.

## Regeneration (future Phase 2 TODO)

There is no record mode yet. When cassettes drift, hand-edit the JSON or
re-run the tiny-mock pipeline locally with a live LLM, then paste the prompt
responses back into the `text` fields here. A future `DTC_LLM_MODE=record`
pass-through will automate this.

## Why fixtures over secrets

A fixture replay is cheaper (zero tokens), safer (no fork-secret leakage
surface), faster (no network), deterministic (cassettes are version-controlled),
and it lets the `e2e-build` CI gate run identically on internal PRs, fork PRs,
and pushes — unblocking GATE-02 without wiring `ANTHROPIC_API_KEY` as a secret.
