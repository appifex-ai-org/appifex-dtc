# @appifex/cli

## 1.0.1

### Patch Changes

- [#17](https://github.com/appifex-ai-org/appifex-dtc/pull/17) [`f106db3`](https://github.com/appifex-ai-org/appifex-dtc/commit/f106db30f1e37275160417f1df8d06066f806c52) Thanks [@rayliu-factory](https://github.com/rayliu-factory)! - OSS readiness: untrack internal planning files, fix package scope refs, expand README, add ROADMAP

- Updated dependencies []:
  - @appifex/mcp-server@1.0.1

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

- [#7](https://github.com/appifex-ai-org/appifex-dtc/pull/7) [`9e27208`](https://github.com/appifex-ai-org/appifex-dtc/commit/9e27208be57f0a8d6c75fd80781aa2a12adbac2b) Thanks [@Roger--Han](https://github.com/Roger--Han)! - Generalize the HTML-based design-import path to advertise Claude Design (Anthropic Labs) alongside Google Stitch and Figma Make. Pipeline behavior is unchanged — `dtc run --design <export>.zip` already accepted any HTML+screenshots zip, but the symbols and docs only mentioned Stitch.

  Renames (behavior-preserving):
  - `extractStitchZip` / `StitchArtifacts` → `extractDesignZip` / `DesignZipArtifacts` (`@appifex/design`)
  - `extractSpecFromStitch` / `*Opts` → `extractSpecFromHtmlDesign` / `*Opts` (`@appifex/spec`)
  - `.stitch/` extract dir → `.design-import/`
  - LLM prompt header `"Stitch Export"` → `"Design Export"`
  - `designFile` zod description in `@appifex/mcp-server` lists Stitch / Figma Make / Claude Design

  `StitchAdapter`, `FigmaMakeAdapter`, `PencilAdapter`, and `adapter-factory` are untouched.

- Updated dependencies [[`9e27208`](https://github.com/appifex-ai-org/appifex-dtc/commit/9e27208be57f0a8d6c75fd80781aa2a12adbac2b), [`eec5bc0`](https://github.com/appifex-ai-org/appifex-dtc/commit/eec5bc03f17dfcea251ee8643db9445c785ba682)]:
  - @appifex/design@1.0.0
  - @appifex/spec@1.0.0
  - @appifex/mcp-server@1.0.0
  - @appifex/agent@1.0.0
  - @appifex/analysis@1.0.0
  - @appifex/baas@1.0.0
  - @appifex/build@1.0.0
  - @appifex/codegen@1.0.0
  - @appifex/core@1.0.0
  - @appifex/deliver@1.0.0
  - @appifex/fix@1.0.0
  - @appifex/provision@1.0.0
  - @appifex/report@1.0.0
  - @appifex/runner@1.0.0
  - @appifex/test-gen@1.0.0
  - @appifex/validate@1.0.0
