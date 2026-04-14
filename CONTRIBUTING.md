# Contributing to appifex-dtc

Thanks for your interest! This project follows **git-flow** with **Conventional Commits** and **Changesets** for releases.

## Prerequisites

- Node ≥22, pnpm ≥9
- macOS with Xcode 15+ (for SwiftUI builds)
- `gitleaks` installed locally: `brew install gitleaks`
- GPG or SSH commit signing configured (required by branch protection)

## Branching

| Branch | Purpose |
|--------|---------|
| `main` | Production. Protected. Merges only via release PR. |
| `develop` | Integration. Protected. Default target for feature PRs. |
| `feature/<ticket>` | Short-lived. PR → `develop`. |
| `release/<version>` | Cut from `develop`, merged to `main` via PR. |
| `hotfix/<ticket>` | Cut from `main`, merged to both `main` and `develop`. |

## Workflow

1. `git checkout -b feature/my-thing develop`
2. Make changes. Commit using Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …).
3. Add a changeset: `pnpm exec changeset` (or `pnpm exec changeset --empty` for docs-only PRs).
4. Push and open a PR targeting `develop`.
5. CI must pass: lint, typecheck, test, e2e-build, commitlint, gitleaks, Changesets check.
6. ≥1 code-owner approval required.

## Local checks before pushing

```bash
pnpm check        # lint + format:check + typecheck + test
```

The pre-commit hook (`lefthook`) runs gitleaks, ESLint, Prettier, and `vitest related` on staged files automatically.

## Commit signing

Branch protection requires signed commits. Configure GPG ([guide](https://docs.github.com/en/authentication/managing-commit-signature-verification)) or SSH signing.

## Releases

Releases are automated via `changesets/action`. Merging the auto-generated "Version Packages" PR to `main` publishes to npm.

See [docs/contributing.md](docs/contributing.md) for deeper architectural context.
