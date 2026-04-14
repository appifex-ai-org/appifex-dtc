#!/usr/bin/env bash
# Phase 1 Plan 09 (FLOW-01, GATE-03, D-13, D-14): apply git-flow branch protection to main + develop
#
# What this does:
#   1. Ensures the `develop` branch exists on origin (creating it from `main` if missing).
#      Per RESEARCH Pitfall 4, `develop` MUST exist BEFORE protection is applied — once
#      protection lands, `git push -u origin develop` would be rejected.
#   2. Applies a single, identical branch-protection ruleset to BOTH `main` and `develop`:
#         - Required status checks: lint, typecheck, test, publish-dry-run, commitlint,
#           gitleaks, e2e-build, "Changesets/Version Packages"
#         - ≥1 code-owner approving review (CODEOWNERS-enforced)
#         - Linear history (squash/rebase only, no merge commits)
#         - Signed commits required (GPG or SSH)
#         - No force-pushes, no branch deletion, conversation resolution required
#         - enforce_admins: false (per D-09 — solo-founder UI override retained as a
#           true-emergency escape hatch)
#   3. Locks repository-level merge settings to align with `required_linear_history`:
#      disables merge commits, enables squash + rebase merges, deletes branches on merge.
#
# Usage:
#   OWNER=appifex REPO=appifex-dtc ./scripts/setup-branch-protection.sh
#   OWNER=appifex REPO=appifex-dtc CODEOWNERS_TEAM_CHECK=1 ./scripts/setup-branch-protection.sh
#
# Requires: gh CLI authenticated as a repo admin, jq.
# Idempotent: PUT replaces the protection state, so re-running is safe.
#
# NOTE on check-context names: the strings under required_status_checks.contexts
# MUST exactly match the names GitHub records for each check run. If branch
# protection rejects a PR with "expected check never ran" — especially for
# "Changesets/Version Packages" whose name has historically drifted between
# changesets/action major versions — open a scratch PR, run
#   gh pr checks <PR-number> --json name,bucket | jq -r '.[].name'
# to read the actually-emitted names, update REQUIRED_CONTEXTS below, and re-run.
#
# CODEOWNERS team caveat (per Plan 02 SUMMARY follow-up #1): CODEOWNERS uses
# `@appifex/maintainers`, a placeholder team. If that team does not exist on the
# `appifex` GitHub org, `require_code_owner_reviews` will not actually block
# merges (GitHub silently treats unresolved owners as no owner). This script
# warns by default and continues; set CODEOWNERS_TEAM_CHECK=1 to abort on a
# missing team.

set -euo pipefail

OWNER="${OWNER:?set OWNER env var, e.g. OWNER=appifex}"
REPO="${REPO:?set REPO env var, e.g. REPO=appifex-dtc}"
CODEOWNERS_TEAM="${CODEOWNERS_TEAM:-appifex/maintainers}"
CODEOWNERS_TEAM_CHECK="${CODEOWNERS_TEAM_CHECK:-0}"

# --- Pre-flight ---------------------------------------------------------------

command -v gh >/dev/null 2>&1 || {
  echo "ERROR: gh CLI not installed. See https://cli.github.com/" >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "ERROR: jq not installed. brew install jq" >&2
  exit 1
}
gh auth status >/dev/null 2>&1 || {
  echo "ERROR: gh not authenticated. Run: gh auth login" >&2
  exit 1
}

# CODEOWNERS team existence check (optional hard-fail).
team_slug="${CODEOWNERS_TEAM#@}"   # strip leading @ if present
team_org="${team_slug%%/*}"
team_name="${team_slug##*/}"
if ! gh api "orgs/$team_org/teams/$team_name" >/dev/null 2>&1; then
  msg="WARNING: CODEOWNERS team '@$team_slug' not found on GitHub. require_code_owner_reviews will be applied but may not actually block merges until the team is created (or CODEOWNERS is updated to a real handle)."
  if [[ "$CODEOWNERS_TEAM_CHECK" == "1" ]]; then
    echo "ERROR: $msg" >&2
    echo "       Re-run without CODEOWNERS_TEAM_CHECK=1 to apply protection anyway." >&2
    exit 1
  fi
  echo "$msg" >&2
fi

# --- Step 1: ensure `develop` exists on origin BEFORE protection (Pitfall 4) ---

if ! gh api "repos/$OWNER/$REPO/branches/develop" >/dev/null 2>&1; then
  echo "develop branch missing on origin — creating from main..."
  git fetch origin main
  git checkout main
  git pull --ff-only
  git checkout -b develop
  git push -u origin develop
  git checkout -
else
  echo "develop branch already exists on origin."
fi

# --- Step 2: apply protection to both branches --------------------------------

# Required status check contexts. If GitHub reports "expected check never ran"
# for any of these, the actual check name has drifted — see header note.
REQUIRED_CONTEXTS=(
  "lint"
  "typecheck"
  "test"
  "publish-dry-run"
  "commitlint"
  "gitleaks"
  "e2e-build"
  "Changesets/Version Packages"
)

# Build the contexts JSON array from the bash array (jq handles quoting).
contexts_json=$(printf '%s\n' "${REQUIRED_CONTEXTS[@]}" | jq -R . | jq -s .)

PROTECTION=$(jq -n --argjson contexts "$contexts_json" '{
  required_status_checks: {
    strict: true,
    contexts: $contexts
  },
  enforce_admins: false,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    required_approving_review_count: 1
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
  required_signatures: true,
  lock_branch: false,
  allow_fork_syncing: true
}')

for BRANCH in main develop; do
  echo "Applying protection to $BRANCH..."
  if ! echo "$PROTECTION" | gh api --method PUT \
      "repos/$OWNER/$REPO/branches/$BRANCH/protection" \
      --input - \
      -H "Accept: application/vnd.github+json" >/dev/null; then
    # Fallback per RESEARCH D-14 gotcha: some API versions reject
    # required_signatures inside the unified PUT and require the dedicated
    # sub-resource endpoint. Strip it from the payload, retry, then POST it.
    echo "  Combined PUT failed — retrying with required_signatures as a follow-up call."
    echo "$PROTECTION" | jq 'del(.required_signatures)' | gh api --method PUT \
      "repos/$OWNER/$REPO/branches/$BRANCH/protection" \
      --input - \
      -H "Accept: application/vnd.github+json" >/dev/null
    gh api --method POST \
      "repos/$OWNER/$REPO/branches/$BRANCH/protection/required_signatures" \
      -H "Accept: application/vnd.github+json" >/dev/null
  fi
  echo "  $BRANCH protected."
done

# --- Step 3: lock down repo-level merge settings ------------------------------

echo "Updating repo-level merge settings (squash + rebase only, delete branch on merge)..."
gh api --method PATCH "repos/$OWNER/$REPO" \
  -F allow_merge_commit=false \
  -F allow_squash_merge=true \
  -F allow_rebase_merge=true \
  -F delete_branch_on_merge=true \
  -H "Accept: application/vnd.github+json" >/dev/null

echo
echo "Done. Verify with:"
echo "  gh api repos/$OWNER/$REPO/branches/main/protection | jq '{required_status_checks, required_pull_request_reviews, required_linear_history, required_signatures, enforce_admins, allow_force_pushes}'"
echo "  gh api repos/$OWNER/$REPO/branches/develop/protection | jq '{required_status_checks, required_pull_request_reviews, required_linear_history, required_signatures, enforce_admins, allow_force_pushes}'"
echo "  git ls-remote --heads origin develop"
