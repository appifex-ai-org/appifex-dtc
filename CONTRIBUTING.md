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

## Signed commits (required)

Branch protection requires signed commits. Set up either GPG or SSH signing once:

### Option A — GPG

```bash
# Generate a key (if you don't have one)
gpg --full-generate-key
# List, grab the long ID
gpg --list-secret-keys --keyid-format=long
# Configure git
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
# Publish the key to GitHub
gpg --armor --export <KEY_ID> | pbcopy  # paste at https://github.com/settings/gpg/new
```

### Option B — SSH (simpler on macOS)

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
# Add the public key at https://github.com/settings/ssh/new with type "Signing Key"
```

Verify: `git commit --allow-empty -m "test: signing works"` then `git log --show-signature -1` must print `Good signature`.

See the [GitHub guide](https://docs.github.com/en/authentication/managing-commit-signature-verification) for more.

## Branch protection setup

Branch protection on `main` and `develop` is reproducible via [`scripts/setup-branch-protection.sh`](scripts/setup-branch-protection.sh). **Only a repo admin needs to run this** — contributors do not.

What the script does (idempotent, safe to re-run):

1. Creates the `develop` branch on origin if missing (must exist BEFORE protection lands, per a GitHub API ordering quirk).
2. Applies the D-14 ruleset to both `main` and `develop`:
   - Required status checks: `lint`, `typecheck`, `test`, `publish-dry-run`, `commitlint`, `gitleaks`, `e2e-build`, `Changesets/Version Packages`
   - ≥1 code-owner approving review (CODEOWNERS-enforced)
   - Linear history (squash/rebase only, no merge commits)
   - Signed commits required
   - No force-pushes, no branch deletion
   - `enforce_admins: false` — solo-founder UI override retained as a true-emergency escape hatch
3. Locks repo-level merge settings: disables merge commits, enables squash + rebase, deletes branches on merge.

**When to run it:**

- Once, on initial repo setup (the v1 open-source release).
- Whenever the set of required CI checks changes (edit `REQUIRED_CONTEXTS` in the script first).
- After any manual drift in the GitHub UI that you want to put back under version control.

**Usage:**

```bash
# From a clean working tree, as a repo admin authenticated via `gh auth login`.
# Defaults: OWNER=appifex-ai-org, REPO=appifex-dtc, CODEOWNERS_USER=rayliu-factory.
./scripts/setup-branch-protection.sh
```

> **CODEOWNERS:** `.github/CODEOWNERS` is owned by the solo maintainer `@rayliu-factory`. When a maintainers team is later created on the `appifex-ai-org` GitHub org, edit CODEOWNERS to point at `@appifex-ai-org/<team>` and re-run the script with `CODEOWNERS_USER=appifex-ai-org/<team>`.

**Verifying protection is live:**

```bash
gh api repos/appifex-ai-org/appifex-dtc/branches/main/protection    | jq '{required_status_checks, required_pull_request_reviews, required_linear_history, required_signatures, enforce_admins, allow_force_pushes}'
gh api repos/appifex-ai-org/appifex-dtc/branches/develop/protection | jq '{required_status_checks, required_pull_request_reviews, required_linear_history, required_signatures, enforce_admins, allow_force_pushes}'
git ls-remote --heads origin develop
```

## Releases

Releases are automated via `changesets/action`. Merging the auto-generated "Version Packages" PR to `main` publishes to npm.

See [docs/contributing.md](docs/contributing.md) for deeper architectural context.
