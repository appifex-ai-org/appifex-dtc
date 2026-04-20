# appifex-dtc

> Design to TestFlight in one command.

[![CI](https://github.com/appifex-ai-org/appifex-dtc/actions/workflows/ci.yml/badge.svg)](https://github.com/appifex-ai-org/appifex-dtc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@appifex/cli.svg)](https://www.npmjs.com/package/@appifex/cli)

`dtc` is a CLI that turns design files (Pencil / Figma / Stitch) into production-ready native and web apps deployed to TestFlight or the Play Store — no manual Xcode, Android Studio, or Firebase Console steps required.

**Status:** v1.0 MVP — SwiftUI + Firebase path is stable and end-to-end tested. Kotlin Compose, React, and React Native targets are in active development.

## Features

- **Design → code in one command** — feed a `.pen`, Figma URL, or Stitch file; get a compilable, linted SwiftUI or Kotlin Compose project back
- **Layered codegen pipeline** — design extraction → spec generation → test generation → codegen → build → validation → LLM-assisted auto-fix → delivery
- **BaaS wiring** — Firebase (Firestore, Auth, Storage) and Supabase schemas inferred from your design and scaffolded automatically
- **Validation gate** — Maestro UI tests + semgrep security scan block delivery on hard failures; `xcodebuild` archive confirms the binary actually compiles
- **Auto-fix loop** — on validation failure the pipeline feeds errors back to the LLM within a tracked `TokenBudget` and retries up to a configurable limit
- **Resume / checkpoint** — every phase is persisted to SQLite; interrupted runs pick up where they left off
- **MCP server** — `dtc-mcp-server` exposes the full pipeline as MCP tools so AI coding agents (Claude, Cursor, etc.) can orchestrate generation workflows
- **Multi-provider LLM** — Anthropic Claude (SDK + `claude --print`), GitHub Copilot, OpenAI, and Google Gemini all supported

## Supported platforms

| Target | Status |
|--------|--------|
| SwiftUI + Firebase | Stable (v1.0) |
| Kotlin Compose + Firebase | In development |
| React (web) | Planned |
| React Native | Planned |

## Install

```bash
npm install -g @appifex/cli
# or
pnpm add -g @appifex/cli
```

Requires Node ≥22, pnpm ≥9, macOS with Xcode 15+ (for iOS/Swift targets).

## Quickstart

```bash
# One-time setup: LLM API key, Apple ASC credentials, Firebase project
dtc setup

# Run the full pipeline
dtc run --design my-app.pen --platform swiftui

# → Extracts design tokens and component tree
# → Generates SwiftUI project + Firebase rules + Firestore schema
# → Archives with xcodebuild
# → Runs Maestro UI tests + semgrep security scan
# → Uploads to TestFlight via App Store Connect API
```

See [docs/getting-started.md](docs/getting-started.md) for the complete walkthrough including credential setup and troubleshooting.

## MCP server

`dtc` ships an MCP server that AI coding agents can use to drive the pipeline:

```bash
# Add to your agent's MCP config
dtc-mcp-server
```

The server exposes pipeline stages as discrete MCP tools — useful for agents that want to run only codegen, only validation, or only delivery.

## How it works

```
Design file (Pencil / Figma / Stitch)
    │
    ▼ design extraction
PlatformSpec + DesignTokens
    │
    ▼ spec generation
Component tree + BaaS schema
    │
    ▼ test generation
Maestro flow + unit test stubs
    │
    ▼ codegen (LLM)
SwiftUI / Kotlin Compose source
    │
    ▼ build (xcodebuild / Gradle)
Compiled binary
    │
    ▼ validation (Maestro + semgrep)
Pass / Fail → auto-fix loop if needed
    │
    ▼ delivery (gh + ASC API)
TestFlight build
```

Each stage is a checkpointed phase. A failed or interrupted run resumes from the last successful phase.

## CLI reference

```
dtc setup              One-time credential and project configuration
dtc run                Execute the full pipeline (see dtc run --help)
dtc doctor             Check prerequisites and credential health
dtc resume             Resume an interrupted pipeline run
dtc report             Print the last run report
```

See [docs/cli-reference.md](docs/cli-reference.md) for all flags and options.

## Repository layout

```
cli/                   CLI entry point and pipeline orchestration
packages/
  core/                Domain types, config, checkpoint, token budget
  design/              Design file adapters (Pencil, Figma, Stitch)
  spec/                Platform spec translation
  codegen/             LLM codegen (Claude, Copilot, OpenAI, Gemini)
  test-gen/            Test scaffold generation
  build/               xcodebuild / Gradle wrappers
  validate/            Maestro UI tests + semgrep security scan
  fix/                 LLM-assisted auto-fix loop
  baas/                Firebase / Supabase schema inference + templates
  provision/           Apple ASC + Google Play provisioning
  report/              Run report generation
  runner/              Local / E2B / remote execution adapters
  mcp-server/          MCP server exposing pipeline as tools
  agent/               LLM agent adapters (Claude, Codex, Gemini)
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [CLI Reference](docs/cli-reference.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This project is maintained by **Appifex AI Technologies, Inc.** — PRs are welcome, but review throughput is limited.

## License

MIT — see [LICENSE](LICENSE).
