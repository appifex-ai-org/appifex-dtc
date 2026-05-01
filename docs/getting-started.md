# Getting Started

Install the CLI globally:

```bash
npm install -g @appifex/cli
```

## Prerequisites

- macOS with Xcode 15+
- Node ≥22, pnpm ≥9
- An Apple Developer account (for TestFlight)
- A Firebase account (free tier works)
- An LLM provider API key (Anthropic, OpenAI, Gemini, or GitHub Copilot)

## One-time setup

```bash
dtc setup
```

The quick wizard captures only what you need for a first local run:
- App name + output directory
- LLM provider, including local Codex or Claude CLI
- Design tool
- Runner environment
- Token budget

All credentials live at `~/.dtc/config.json`. Nothing is committed to your project.

For production delivery setup, run:

```bash
dtc setup --full
```

That adds Firebase, Apple/TestFlight, Google Play, git delivery, and OAuth setup.

## First run

```bash
dtc run --design my-app.pen --platform swiftui
```

The pipeline runs design → spec → test-gen → codegen → build → validate → fix → deliver. On success, the build appears in TestFlight under your configured internal testing group.

## Resuming a failed run

```bash
dtc run --resume
```

Checkpoints in `<output>/.dtc/checkpoint.db` let the pipeline skip completed phases.

See the [CLI reference](cli-reference.md) for all commands and flags.
