# dtc CLI

Terminal UI for the Design-to-Code toolkit. Powered by [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and [@clack/prompts](https://github.com/bombshell-dev/clack).

## Setup

```bash
dtc setup
```

Interactive wizard that walks you through:

```
◆  LLM provider
│  ● Anthropic (Claude)  — recommended
│  ○ OpenAI (GPT)
│  ○ Google (Gemini)
│
◆  API key
│  ●●●●●●●●●●●●●●●●
│
◆  Design tool
│  ● Pencil
│  ○ Google Stitch
│  ○ Figma Make
│
◆  Runner environment
│  ● Local
│  ○ E2B (cloud sandbox)
│  ○ Remote Mac Runner
│
◆  Configure Apple TestFlight?
│  No
│
◆  Token budget (total)
│  100000
│
◇  Configuration saved
│
│  Config:  ~/.dtc/config.json
│  LLM:    anthropic
│  Design: pencil
│  Runner: local
│  Budget: 100,000 tokens
│
└  Ready! Run `dtc design --prompt "..."` to start.
```

## Full pipeline

```bash
dtc run --prompt "Pet adoption app with browse, favorites, adoption form" \
        --platform swiftui \
        --out ./pet-app
```

Live terminal UI shows progress through each phase:

```
⠋ Pet adoption app with browse, favorites, adopt

  ✓ Design        Design created
  ✓ Spec          5 screens, swiftui
  ✓ Tests         5 UI flows, 3 unit tests (locked)
  ✓ Codegen       14 files
  ✓ Build         swiftui ✓
  ◐ Validate      UI 4/5  Unit 11/12
  ○ Fix
  ○ Report
  ○ Provision

  Tokens: 23,400 / 100,000  ━━━━━━░░░░░░░░░░░░░░░░░░
```

After validation, if tests fail, the fix loop kicks in:

```
  ✗ Validate      UI 4/5  Unit 11/12
  ◐ Fix           swiftui — attempt 1/5

  #1  +3 tests fixed  (3,400 tokens)
     Before: 15/17  →  After: 17/17  Files: Home.tsx, utils.ts

  ✅ ALL GREEN — 1 attempt, 3,400 tokens
```

Final report:

```
✅ Pet adoption app with browse, favorites, adopt — Complete

  swiftui           UI 5/5  Unit 12/12  Fix 1 attempt

  Tests: 17/17  Tokens: 26,800  Design: 1 iteration  Fix: 1 attempt  Duration: 45.2s
```

## Import an external design export

Bring a design from tools that aren't wired up as adapters — export a zip of
HTML + screenshots and pass it via `--design`:

```bash
dtc run --design ~/Downloads/my-design.zip \
        --prompt "Refine: make the browse grid 2-column" \
        --platform swiftui \
        --out ./pet-app
```

Works with:

- **Google Stitch** — download the zip export
- **Figma Make** — *File → Export HTML* → zip the folder
- **Claude Design** (Anthropic Labs) — *Export → Standalone HTML files* → zip
  the folder

The zip is unpacked into `.design-import/`, HTML + screenshots (+ optional
`design.md`) are fed through LLM vision to produce a normalized spec, and the
rest of the pipeline (codegen → build → validate → fix → deliver) runs
unchanged.

## Individual commands

Every `@dtc/*` package is accessible as a standalone command:

```bash
# Design
dtc design --prompt "Shopping app" --out design.pen
dtc design --in design.pen --out design.pen --prompt "Add cart icon"

# Spec
dtc spec extract design.pen --out spec.json
dtc spec translate spec.json --platform swiftui --out spec.swift.json

# Test generation
dtc test-gen ui spec.swift.json --out .maestro/
dtc test-gen unit requirements.md --platform swiftui --out Tests/

# Build
dtc build --platform swiftui --project ./app --scheme PetApp
dtc build --platform kotlin-compose --project ./app-android

# Validate
dtc validate --all --platform swiftui --project ./app

# Apple TestFlight (archive + submit)
dtc provision submit --project ./app               # archive + submit
dtc provision submit --project ./app --scheme PetApp  # with scheme
dtc provision submit --ipa app.ipa                 # pre-built IPA only
```

## TUI components

The terminal UI is built with composable React (Ink) components:

| Component | What it renders |
|-----------|----------------|
| `PipelineView` | Phase list with status icons, token budget progress bar |
| `ValidationView` | Per-platform test results with failure details |
| `FixLoopView` | Live attempt counter, before/after test diffs, recommendation |
| `ReportView` | Final summary — tests, tokens, duration, fix attempts |
| `RunApp` | Orchestrates pipeline → PipelineView → ReportView |

### Pure formatters

All display logic lives in `format.ts` as pure functions (no Ink dependency), making them testable:

```typescript
import { formatPhaseStatus, formatTokenBar, formatValidationSummary, formatFixStatus } from './views/format.js'

formatPhaseStatus({ id: 'build', status: 'completed', message: 'swiftui ✓' })
// "  ✓ Build         swiftui ✓"

formatTokenBar(25_000, 100_000)
// "  Tokens: 25,000 / 100,000  ━━━━━━░░░░░░░░░░░░░░░░░░"

formatFixStatus({ status: 'all_green', attempts: 1, tokensUsed: 3400 })
// "  ✅ ALL GREEN — 1 attempt, 3,400 tokens"
```
