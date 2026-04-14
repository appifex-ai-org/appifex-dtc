# External Integrations

**Analysis Date:** 2026-04-14

## APIs & External Services

**LLM Providers (configurable via `LlmConfig.provider`):**
- Anthropic Claude API - SDK: `@anthropic-ai/sdk` ^0.52.0
  - Used in: `packages/codegen/src/default-generate.ts:198`, `packages/codegen/src/layered-generate.ts:70`, `packages/fix/src/default-fix.ts:136`, `cli/src/pipeline.ts:724`
  - Auth: `config.llm.apiKey` (from `~/.dtc/config.json`)
- OpenAI (GPT) - No SDK; raw HTTPS to `https://api.openai.com/v1`
  - Used in: `cli/src/pipeline.ts:700-701`
  - Auth: `config.llm.apiKey`
- Google Gemini - No SDK; raw HTTPS to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - Used in: `cli/src/pipeline.ts:672`
  - Auth: `config.llm.apiKey` as query param
- GitHub Copilot - SDK: `@github/copilot-sdk` ^0.2.0
  - Used in: `cli/src/pipeline.ts:624`, `cli/src/providers/copilot.ts:105`
  - Auth: GitHub OAuth device flow (`cli/src/providers/copilot.ts`) storing `githubToken` in `LlmConfig.githubToken`
  - Requires env: `DTC_GITHUB_CLIENT_ID`
- Claude Code (local CLI) - Subprocess invocation
  - Used in: `packages/codegen/src/claude-cli-generate.ts` (spawns `claude` binary)
  - Auth: delegated to local `claude` CLI

**Design Tools (configurable via `DesignConfig.tool`):**
- Pencil (via MCP) - `packages/design/src/pencil-adapter.ts`, `packages/design/src/pencil-mcp-client.ts`
  - Auth: `DesignConfig.apiKey` or env `PENCIL_CLI_KEY`
  - Transport: MCP protocol over `DesignConfig.mcpUrl`
- Google Stitch - SDK: `@google/stitch-sdk` ^0.1.0 (`packages/design/src/stitch-adapter.ts`)
  - Auth: `DesignConfig.apiKey` or env `STITCH_API_KEY`
  - Default API: `https://stitch.googleapis.com/mcp`
- Figma Make - REST client at `packages/design/src/figma-rest-client.ts`; adapter at `packages/design/src/figma-make-adapter.ts`
  - Auth: `DesignConfig.figmaToken` or env `FIGMA_TOKEN`
  - File reference: `DesignConfig.figmaFileUrl`

**Mobile Platform Publishing:**
- Apple App Store Connect - `packages/provision/src/asc-client.ts`
  - Auth: `AppleConfig.ascKeyId` + `ascIssuerId` + `ascKeyPath` (p8 key) from `DtcConfig.apple`
  - Deploys to TestFlight via `AppleConfig.ascTestFlightGroup`
- Google Play Console - SDK: `@googleapis/androidpublisher` ^14.1.0 (`packages/provision/src/play-console-client.ts`)
  - Auth: service-account JSON via `AndroidConfig.serviceAccountKeyPath`
  - Scope: `https://www.googleapis.com/auth/androidpublisher`
  - Track: `AndroidConfig.playTrack` (default `"internal"`)

**Source Control / Code Hosting:**
- GitHub - `packages/deliver/src/github.ts`, `packages/deliver/src/git-client.ts`, `packages/deliver/src/deliver.ts`
  - Used for: PR creation, push, auto-merge
  - Config: `DtcConfig.deliver` (`remoteUrl`, `repo`, `baseBranch`, `autoMerge`, `mergeMethod`, `repoVisibility`)
  - Auth: leverages local `git` + `gh` credentials via Runner shell

**Remote Execution (Runner abstraction, `RunnerConfig.type`):**
- E2B cloud sandbox - `packages/runner/src/e2b-runner.ts`
  - Endpoint: `https://api.e2b.dev`
  - Auth: `apiKey` (passed to `createRunner`) + `sandboxId`
- Remote custom runner (Mac Runner) - `packages/runner/src/remote-runner.ts`
  - Auth: `RunnerConfig.runnerUrl` + `RunnerConfig.runnerToken` (bearer)
- Local - `packages/runner/src/local-runner.ts` (no external service)

## Data Storage

**Databases:**
- SQLite (embedded) - `better-sqlite3` ^11.0.0
  - File: local checkpoint DB created by `packages/core/src/checkpoint.ts`
  - Purpose: pipeline checkpoint/resume state

**File Storage:**
- Local filesystem (user `~/.dtc/` for config + run context)
- Project working directories (configurable `projectDir` / `cwd` passed to Runner)
- Run context serialized via `packages/core/src/run-context.ts`, `snapshot-sidecar.ts`

**Caching:**
- None detected (no Redis / memcached / HTTP cache layer)

## Authentication & Identity

**For the toolkit itself:**
- GitHub device-flow OAuth (for Copilot provider) - `cli/src/providers/copilot.ts` (`startDeviceFlow`, `pollForToken`)
  - Client ID env: `DTC_GITHUB_CLIENT_ID`
- API-key-based auth for all other LLM/design providers (stored in `~/.dtc/config.json`)

**For generated apps (BaaS providers via `@dtc/baas`):**
- Firebase Auth - templates + deep-link config stubs in `packages/baas/src/auth-deep-link.ts`, `packages/baas/src/config-stubs.ts` (`GoogleService-Info.plist`)
- Supabase Auth - `.env` stubs with `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `packages/baas/src/config-stubs.ts`
- Mock auth provider - `@dtc/mock` package
- Selection via `BaasConfig` (`DtcConfig.baas`); valid values `firebase | supabase | mock` (see `bin/dtc` validation)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logs:**
- Fastify built-in logger in sidecar (`sidecar/dist/server.js`: `Fastify({ logger: true })`)
- Debug logger: `packages/core/src/debug-logger.ts`
- Progress events: `packages/core/src/progress.ts` (`ProgressEmitter`)
- Console output with chalk formatting in CLI

## CI/CD & Deployment

**Hosting:**
- Distributed as npm CLI package (`appifex-dtc`) - consumed locally, not hosted

**CI Pipeline:**
- No CI configuration files detected (no `.github/workflows/`, no `.circleci/`, etc.)

**MCP Server:**
- `@dtc/mcp-server` exposes toolkit over Model Context Protocol via stdio transport (`packages/mcp-server/src/index.ts`)
- Binary: `dtc-mcp-server`
- Tool registration: `packages/mcp-server/src/server-tools-pipeline.ts`, `server-tools-dev.ts`, `packages/mcp-server/src/tools/*.ts`

**Sidecar HTTP Service:**
- `sidecar/dist/server.js` - Fastify server wrapping `@dtc/*` packages for Python backend integration
- Endpoints: `/health`, `/spec/generate`, `/spec/translate`, `/test-gen/ui`, `/test-gen/spec-unit`, `/codegen/generate`, and more

## Environment Configuration

**Required env vars (optional — can be supplied via config file):**
- `PENCIL_CLI_KEY` - Pencil design tool key
- `STITCH_API_KEY` - Google Stitch key
- `FIGMA_TOKEN` - Figma OAuth / PAT
- `DTC_GITHUB_CLIENT_ID` - GitHub App client ID for Copilot device-flow auth
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` - Android SDK location
- `HOME`, `PATH` - Standard; PATH amended with `~/.maestro/bin` during validate

**Secrets location:**
- Primary: `~/.dtc/config.json` (default; overridable via `configDir`) — contains `llm.apiKey`, `llm.githubToken`, `design.apiKey`, `design.figmaToken`, Apple ASC key paths, Android keystore credentials, Android service account path
- Project `.env` files for Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) - generated as stubs under `packages/baas/src/config-stubs.ts`
- No secret manager integration (Vault/AWS Secrets Manager/etc.)

## External Tooling (invoked as subprocess)

**Build / SDK toolchains (via Runner.exec):**
- `xcodebuild`, `xcrun`, `swift` - iOS builds via `@dtc/build`
- `gradle` / `gradlew` - Android builds via `@dtc/build`
- `adb` - Android emulator control (`packages/validate/src/unit-tests.ts`)
- `maestro` - Mobile UI tests (`packages/validate/src/maestro.ts`)
- `semgrep` - Static analysis security scan (`packages/validate/src/semgrep.ts`)
- `git` + `gh` - Delivery/PR creation (`packages/deliver/src/git-client.ts`, `github.ts`)
- `claude` CLI - `packages/codegen/src/claude-cli-generate.ts` (when provider is `claude-cli`)

## Webhooks & Callbacks

**Incoming:**
- None (sidecar exposes synchronous HTTP endpoints; no webhook receivers)

**Outgoing:**
- None (toolkit does not emit webhooks)

---

*Integration audit: 2026-04-14*
