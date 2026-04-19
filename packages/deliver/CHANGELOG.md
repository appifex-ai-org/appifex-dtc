# @appifex/deliver

## 1.0.0

### Major Changes

- [#5](https://github.com/appifex-ai-org/appifex-dtc/pull/5) [`eec5bc0`](https://github.com/appifex-ai-org/appifex-dtc/commit/eec5bc03f17dfcea251ee8643db9445c785ba682) Thanks [@rayliu-factory](https://github.com/rayliu-factory)! - **v1.0 MVP — Design to TestFlight in one command**

  First production release. Hardens the SwiftUI + Firebase pipeline end-to-end so a solo founder can run `dtc` once and get a TestFlight build from a design file with no manual Xcode or Firebase console steps.

  ### What's included
  - Open-source-ready `@appifex/*` monorepo with git-flow, PR gates, Changesets, commitlint, gitleaks, and required CI (lint/typecheck/vitest + E2E smoke + changeset-check)
  - Foundation bugs fixed: portable `bin/dtc` shim, corrected Swift token density, EPIPE hard-fail, MCP `process.exit` isolation
  - `dtc setup --full` credential wizard (Apple ASC, Firebase, LLM) + `CredentialRegistry` preflight + `dtc doctor --deep`
  - Firebase integration: SPM `AppDelegate`, email/Apple/Google auth templates, typed Codable Firestore data layer, idempotent `firebase_provision` phase, security lint hard-fail
  - Xcode archive + TestFlight upload: `js-yaml` `project.yml` mutator, ASC REST JWT, `xcrun altool` polling loop, release hygiene injection
  - Maestro E2E golden-path gate + `fix-context-ranker` locality + Anthropic structured outputs + hard/soft fail split
  - `sanitizeLayerName` across all 4 design adapters + adapter-parity fixture suite
  - MCP tools: `dtc_firebase_provision`, `dtc_testflight_upload`, `dtc_get_pipeline_status`
  - Live token/USD cost display + `.dtc-report` structured output + zippable debug bundle

### Patch Changes

- Updated dependencies [[`eec5bc0`](https://github.com/appifex-ai-org/appifex-dtc/commit/eec5bc03f17dfcea251ee8643db9445c785ba682)]:
  - @appifex/core@1.0.0
  - @appifex/runner@1.0.0
