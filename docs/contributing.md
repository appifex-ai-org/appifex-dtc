# Contributing — Developer Notes

See [/CONTRIBUTING.md](../CONTRIBUTING.md) for the canonical contributor workflow.

This file holds developer-environment specifics.

## Repo layout

```
cli/                  # @appifex/cli — argv, Ink UI, runPipeline orchestrator
packages/<pkg>/       # @appifex/<pkg> — workspace packages
sidecar/              # Compiled remote runner (no TS source in repo)
docs/                 # User-facing docs
.planning/            # GSD planning artefacts (not shipped to npm)
```

## Local dev loop

```bash
pnpm install
pnpm build
pnpm test
pnpm setup            # builds + symlinks bin/dtc into PATH
```

Vitest aliases (`vitest.config.ts`) point each `@appifex/*` import at `src/index.ts`, so tests run without a build step.

## Adding a new package

1. Create `packages/<new-pkg>/{src,package.json,tsconfig.json}`.
2. `name`: `@appifex/<new-pkg>`. Match the `package.json` shape of `packages/core/package.json`.
3. Add an alias to `vitest.config.ts`.
4. Run `pnpm install` to refresh the lockfile.

## Architecture

See `.planning/codebase/ARCHITECTURE.md` for the layered pipeline + ports/adapters overview.
