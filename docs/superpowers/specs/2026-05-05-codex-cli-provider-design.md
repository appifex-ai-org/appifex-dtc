# Codex CLI LLM Provider Design

Date: 2026-05-05

## Goal

Enable `codex-cli` as a local LLM provider for `dtc`, parallel to `claude-cli`.
This provider uses the user's installed and authenticated `codex` command instead
of storing an OpenAI API key in `~/.dtc/config.json`.

This first slice is text-only. Existing multimodal/image message parts are not
sent to Codex CLI yet; that can be added in a later design once the target CLI
input contract is chosen and tested.

## Non-Goals

- Do not change the existing `agent.type = codex` project-editing agent mode.
- Do not implement OAuth or token storage in `dtc`; Codex CLI owns local auth.
- Do not add image or screenshot passing in this slice.
- Do not replace the OpenAI API provider.

## Architecture

Add `codex-cli` to `DtcConfig['llm'].provider` and treat it as a local CLI
provider. The pipeline keeps two Codex concepts separate:

- `llm.provider = codex-cli` returns one text model response for the existing
  `createMessage` call shape used by spec, codegen, schema, and fix flows.
- `agent.type = codex` remains the single-session project-editing agent path.

The implementation should add a testable Codex CLI helper, similar in spirit to
`runClaudePrint`. The helper accepts a prompt, model, and cwd, spawns `codex`,
and normalizes stdout into:

```ts
{
  content: [{ type: 'text', text }],
  usage: { input_tokens: 0, output_tokens: 0 },
}
```

Usage remains zero until Codex CLI exposes stable parseable usage metadata for
this invocation path.

## Data Flow

`dtc setup llm` gains a Codex CLI option. Choosing it stores:

```json
{
  "llm": {
    "provider": "codex-cli",
    "apiKey": "",
    "model": "<selected model>"
  }
}
```

During `dtc run`, provider selection follows this order:

1. Fixture mode still wins first.
2. `claude-cli` keeps its current branch.
3. `codex-cli` serializes messages into plain text and invokes the Codex helper.
4. Copilot, Google, OpenAI, and Anthropic keep their existing behavior.

Message serialization is deliberately narrow for this first slice:

- string content is included as-is;
- array content includes only text parts;
- image parts are omitted;
- unknown content falls back to `String(content)`.

When image parts are omitted, verbose/debug output should make that visible so
future multimodal work has a clear trail.

## Setup And Preflight UX

Setup should label the option as local auth, for example:

```text
Codex CLI (local auth)
```

The setup flow should tell the user to install and authenticate Codex CLI when
needed:

```text
Using local Codex CLI - make sure `codex` is installed and authenticated with
`codex --login` or OPENAI_API_KEY.
```

Preflight and doctor behavior should mirror local CLI auth:

- pass if `codex` is installed when `llm.provider === 'codex-cli'`;
- fail critically if `codex` is missing;
- never require `llm.apiKey` or `OPENAI_API_KEY` for this config path;
- provide install/auth guidance in the failure hint.

## Error Handling

`runCodexCli` should fail closed when the CLI cannot produce usable output.
It should handle:

- missing or spawn-failed binary;
- non-zero exit code;
- empty stdout;
- stdin `EPIPE`;
- stderr context with a short stdout preview.

Errors should name the failing command and include remediation such as:

```text
Install Codex CLI and run `codex --login`.
```

The helper should use the same defensive stdin error ordering as `runClaudePrint`:
register stdin error handlers before writing the prompt, and kill the child on
non-EPIPE stdin failures.

## Testing

Add focused tests for:

- config types and config loading accepting `codex-cli`;
- `dtc setup llm` storing `apiKey: ""` for `codex-cli`;
- prerequisites/preflight passing or failing based on `codex` availability, not
  API key presence;
- pipeline provider routing for `codex-cli`;
- `runCodexCli` success, empty stdout, non-zero exit, and stdin `EPIPE`.

The existing fixture-mode tests should remain unchanged: fixture mode must still
short-circuit before any local provider branch.
