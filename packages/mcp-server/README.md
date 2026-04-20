# @appifex/mcp-server

MCP server that exposes the full DTC design-to-code toolkit to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io/).

## Quick Start

```bash
# Build the server
pnpm build

# Run it (stdio transport — meant to be spawned by an AI agent)
node dist/index.js
```

## Connecting from Pydantic AI (Python)

```python
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio

dtc_server = MCPServerStdio(
    "node",
    args=["packages/appifex-dtc/packages/mcp-server/dist/index.js"],
    env={"HOME": os.environ["HOME"]},  # needed for ~/.dtc config
    timeout=30,
    read_timeout=600,  # fix loop and pipeline can take minutes
)

agent = Agent(
    "anthropic:claude-sonnet-4-6",
    toolsets=[dtc_server],
    system_prompt="You are a mobile app developer. Use DTC tools to build apps.",
)

async with agent:
    result = await agent.run("Build a pet adoption app with SwiftUI")
```

## Connecting from Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dtc": {
      "command": "node",
      "args": ["/absolute/path/to/packages/appifex-dtc/packages/mcp-server/dist/index.js"],
      "env": { "HOME": "/Users/yourname" }
    }
  }
}
```

## Connecting from Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dtc": {
      "command": "node",
      "args": ["packages/appifex-dtc/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Connecting from the Appifex Backend

### Option A: Pydantic AI Agent Toolset

```python
from pydantic_ai.mcp import MCPServerStdio

dtc_mcp = MCPServerStdio(
    "node",
    args=[str(DTC_MCP_SERVER_PATH / "dist" / "index.js")],
    env={"HOME": os.environ.get("HOME", "")},
    timeout=30,
    read_timeout=600,
)

agent = Agent("model", toolsets=[dtc_mcp, other_toolsets...])
```

### Option B: Claude Agent SDK MCP Server

```python
# In backend/app/claude_code/runner.py
options = ClaudeAgentOptions(
    mcp_servers={
        "appifex": appifex_mcp_server,
        "dtc": dtc_mcp_server_config,
    },
    ...
)
# Tools appear as mcp__dtc__build, mcp__dtc__validate, etc.
```

## Available Tools (21)

### Pipeline (Full Orchestration)

| Tool | Description |
|------|------------|
| `dtc_run_pipeline` | Run the entire design-to-code pipeline (design, spec, test-gen, codegen, build, validate, fix, deliver, report) |

### Prompt Refinement

| Tool | Description |
|------|------------|
| `dtc_refine_prompt` | Refine a vague app prompt into a detailed one. Use "ask" mode to get clarifying questions, then "enrich" mode with user answers to produce a pipeline-ready prompt |
| `dtc_refine_feature_prompt` | Refine a vague add-feature prompt into a detailed prompt with assumptions. First call returns assumptions for confirmation, second call with `confirmed=true` returns the enriched prompt |

### Add Feature

| Tool | Description |
|------|------------|
| `dtc_add_feature` | Add a feature to an existing project. Validates that a prior completed run exists at outputDir before proceeding |

### Design

| Tool | Description |
|------|------------|
| `dtc_design_create` | Generate a `.pen` design file from a text prompt |
| `dtc_design_iterate` | Apply changes to an existing `.pen` design file |

### Spec

| Tool | Description |
|------|------------|
| `dtc_spec_extract` | Extract a DesignSpec from a `.pen` file (deterministic, no LLM) |
| `dtc_spec_translate` | Translate a DesignSpec to a platform-specific PlatformSpec (SwiftUI or Kotlin Compose) |

### Test Generation

| Tool | Description |
|------|------------|
| `dtc_test_gen_ui` | Generate Maestro UI test flows from a PlatformSpec |
| `dtc_test_gen_unit` | Generate unit tests (XCTest or JUnit) from a PlatformSpec |

### Build

| Tool | Description |
|------|------------|
| `dtc_build` | Build a project (xcodebuild for SwiftUI, Gradle for Kotlin Compose) |

### Validation

| Tool | Description |
|------|------------|
| `dtc_validate` | Run all tests: Maestro UI + unit tests + optional Semgrep security scan |
| `dtc_security` | Run Semgrep OWASP security scan |

### Fix

| Tool | Description |
|------|------------|
| `dtc_fix` | Run the TDD fix loop (fix, build, validate, repeat until green or circuit breaker) |

### Deliver

| Tool | Description |
|------|------------|
| `dtc_deliver` | Git commit + push + PR creation. Auto-creates GitHub repo if needed. |

### Report

| Tool | Description |
|------|------------|
| `dtc_report` | Generate a pipeline report (markdown or JSON) |

### Provision & Submit

| Tool | Description |
|------|------------|
| `dtc_provision_submit` | Build and submit an app to TestFlight (iOS) or Play Console Internal Testing (Android). Auto-detects platform from the project directory |

### Analysis

| Tool | Description |
|------|------------|
| `dtc_analyze` | Scan an existing project to produce a structural inventory and navigation graph |

### Config & Context

| Tool | Description |
|------|------------|
| `dtc_load_config` | Load DTC configuration from `~/.dtc/config.json` |
| `dtc_load_context` | Load the previous run context from a project directory |
| `dtc_save_context` | Save a run context for future resume/add-feature/refactor |

## Tool Details

### `dtc_run_pipeline`

The highest-level tool. Runs the entire pipeline in non-interactive mode.

**Input:**
```json
{
  "prompt": "Pet adoption app with browse, favorites, and adoption form",
  "platform": "swiftui",
  "outputDir": "/path/to/output",
  "designFile": "/optional/path/to/design.pen",
  "mode": "fresh",
  "agentType": "auto",
  "verbose": false,
  "benchmark": false,
  "resumeSessionId": "optional-session-id",
  "configDir": "/optional/path/to/.dtc",
  "baasProvider": "firebase"
}
```

**Output:**
```json
{
  "status": "completed",
  "summary": { "allGreen": true, "totalTests": 12, "totalPassed": 12 },
  "markdown": "# Pet App\n**Status:** ALL GREEN...",
  "deliver": { "commitHash": "abc1234", "branch": "dtc/1712100000" },
  "events": ["[design] started: Creating design...", "..."]
}
```

### `dtc_build`

**Input:**
```json
{
  "platform": "swiftui",
  "projectDir": "/path/to/project",
  "scheme": "MyApp"
}
```

**Output:**
```json
{
  "success": true,
  "duration": 12345,
  "errors": []
}
```

### `dtc_validate`

**Input:**
```json
{
  "platform": "swiftui",
  "projectDir": "/path/to/project",
  "runSecurity": true
}
```

**Output:**
```json
{
  "allPassed": false,
  "ui": { "total": 4, "passed": 3, "failed": 1 },
  "unit": { "total": 8, "passed": 8, "failed": 0 },
  "security": { "total": 0, "passed": 0, "failed": 0, "findings": [] }
}
```

### `dtc_fix`

**Input:**
```json
{
  "platform": "swiftui",
  "projectDir": "/path/to/project",
  "maxAttempts": 5,
  "tokenBudget": 200000
}
```

**Output:**
```json
{
  "status": "all_green",
  "attempts": [{ "attempt": 1, "testsBefore": {...}, "testsAfter": {...} }],
  "totalTokensUsed": 15000,
  "totalDuration": 45000
}
```

### `dtc_refine_prompt`

Two-step flow: first call with `mode: "ask"` returns clarifying questions, then call with `mode: "enrich"` and user answers to get a pipeline-ready prompt.

**Input (ask mode):**
```json
{
  "prompt": "todo app",
  "mode": "ask",
  "platform": "swiftui"
}
```

**Output (ask mode):**
```json
{
  "mode": "ask",
  "prompt": "todo app",
  "completenessScore": 17,
  "questions": [
    { "id": "screens", "question": "What screens should the app have?", "category": "Screens", "required": true },
    { "id": "navigation", "question": "What navigation pattern?", "category": "Navigation", "options": ["Tab bar", "Stack", "Drawer"], "required": true }
  ],
  "hint": "Or just say \"just build it\" to skip all questions and build with sensible defaults."
}
```

**Input (enrich mode):**
```json
{
  "prompt": "todo app",
  "mode": "enrich",
  "answers": "{\"screens\": \"home, detail, settings\", \"navigation\": \"Tab bar\"}",
  "platform": "swiftui"
}
```

### `dtc_add_feature`

**Input:**
```json
{
  "prompt": "Add a favorites screen with heart button on each item",
  "outputDir": "/path/to/existing/project",
  "platform": "swiftui",
  "confirmed": true
}
```

### `dtc_provision_submit`

**Input:**
```json
{
  "projectDir": "/path/to/project",
  "platform": "ios",
  "scheme": "App",
  "exportMethod": "app-store"
}
```

### `dtc_analyze`

**Input:**
```json
{
  "outputDir": "/path/to/existing/project",
  "platform": "swiftui"
}
```

### `dtc_spec_extract` + `dtc_spec_translate`

Typically used in sequence:

```
1. dtc_spec_extract({ filePath: "design.pen" })
   → returns DesignSpec JSON

2. dtc_spec_translate({ specJson: <result>, platform: "swiftui" })
   → returns PlatformSpec JSON with SwiftUI types, testIds, SF Symbols
```

## Architecture

```
AI Agent (Pydantic AI / Claude Desktop / Claude Code)
    |
    | MCPServerStdio (spawns as subprocess)
    v
@appifex/mcp-server (TypeScript, stdio transport)
    |
    | imports @appifex/core, @appifex/runner, @appifex/design, @appifex/spec, etc.
    v
DTC Package APIs
    |
    | Runner.exec(), Runner.readFile(), etc.
    v
Local Machine / E2B Sandbox / Remote Mac Runner
```

Tool handlers are separated from MCP wiring in `src/tools/` — each is a plain async function that can be tested independently without the MCP SDK.

## Configuration

The MCP server reads DTC config from `~/.dtc/config.json` (or a custom path via the `configDir` parameter on most tools). Run `dtc setup` to configure:

- LLM provider (Anthropic, OpenAI, Google, Copilot, Claude CLI)
- Design tool (Pencil, Google Stitch, or Figma Make; plus zero-config `.zip` import for Stitch / Figma Make / Claude Design exports via `designFile`)
- Runner type (local, E2B, remote)
- Apple credentials (optional)
- Deliver config (optional)

## Development

```bash
# Install deps
pnpm install

# Run tests
npx vitest run packages/mcp-server/__tests__/

# Build
pnpm --filter @appifex/mcp-server run build
```

## Important Notes

- The server uses **stdio transport** — never use `console.log()` in tool handlers (it corrupts the JSON-RPC stream). Use `console.error()` for debugging.
- Long-running tools (`dtc_fix`, `dtc_run_pipeline`) can take minutes. Set `read_timeout=600` or higher in `MCPServerStdio`.
- The `dtc_run_pipeline` tool runs in **non-interactive mode** — all TTY prompts (design review, budget continuation) are skipped.
- All tools return `{ content: [{ type: "text", text: "..." }], isError: boolean }` following the MCP protocol.
