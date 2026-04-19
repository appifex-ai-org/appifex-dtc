---
phase: 6
slug: validation-gate-hardening
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-19
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Test fixtures → Vitest | Test-stub creation only; no runtime surface. | Mocked credentials (non-sensitive) |
| PhaseId / CliError hierarchy | Type-only additions; no new runtime IO. | None |
| Ranker input → projectDir | `failures.*`, `flowYaml`, `modifiedScreens` from trusted pipeline code, not user input. | Pipeline-internal paths |
| Ranker → Runner.readFile | Path comes from `candidates[0]`, built from trusted pipeline sources. | File contents (local project) |
| validate-all → runSemgrep subprocess | Unchanged from pre-phase; semgrep now unconditional when `runSecurity`. | Project source files |
| Template source → generated app | Template changes enter every generated SwiftUI app; must be safe SwiftUI. | Static strings only |
| Anthropic API response → `fix.path` / `fix.content` | UNTRUSTED — Claude can hallucinate path-traversal attempts. | LLM-generated paths + code |
| `runner.writeFile(fullPath, content)` | Writes to generated-app tree under `opts.projectDir`. | Generated source content |
| runE2eGatePhase → disk write | Writes hardcoded YAML template; no dynamic user interpolation. | YAML flow definition |
| Maestro subprocess | Spawned by `runMaestro`; existing trusted surface. | Test execution I/O |
| CLI argv → terminal gate decision | `--skip-validation-gate` is trusted dev-machine input. | Flag value only |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-6-00-a | Tampering | Test-fixture secrets | accept | No real credentials in any stub; hard-coded `'test-key'` matches existing idiom. | closed |
| T-6-00-b | DoS | CI test suite latency | accept | 7 new unit-scope test files with mocked deps; expected < 3s each. | closed |
| T-6-01-a | Tampering | PhaseId enumeration | accept | Closed string-literal union; all switch/case patterns have default cases. | closed |
| T-6-01-b | Elevation of Privilege | E2eGateError subclass | mitigate | `E2eGateError extends CliError`; exit-code contract inherited via `super(message, 1)`. MCP wrapper checks `instanceof CliError`, not `.name`. | closed |
| T-6-01-c | Info Disclosure | `maestroError` field | accept | Stores Maestro's own error message; already logged by `runMaestro`. No new disclosure surface. | closed |
| T-6-02-a | Tampering | Path-traversal in flowYaml `id` field | mitigate | `extractFlowIds` regex uses `[A-Za-z_]\w+` — `.`, `/`, `\` rejected. `resolveIdToScreenFile` only returns paths from trusted `inventory`. Verified: `fix-context-ranker.ts:168,171`. | closed |
| T-6-02-b | Tampering | Ranker reading attacker-controlled file | accept | One-shot `runner.readFile` on `candidates[0]` (pipeline-trusted). Content only influences an integer; no data flow to writes. Failure swallowed. | closed |
| T-6-02-c | DoS | Large flowYaml regex backtracking | mitigate | All regexes use bounded character classes (`\w+`, `[^\s:)'"]+`); no catastrophic-backtracking alternation; O(n) worst case. Verified: `fix-context-ranker.ts:168-172`. | closed |
| T-6-02-d | Info Disclosure | Unrelated project files in LLM context | accept | Ranker narrows scope (D-07 deletes first-10-glob fallback). All candidates from `inventory` scoped to `Sources/` and `src/`. | closed |
| T-6-03-a | Repudiation / Security Bypass | Maestro flake silently skips semgrep | mitigate | D-18 makes semgrep unconditional when `opts.runSecurity`. Combined guard `opts.runSecurity && baseTestsPassed` removed. Verified: `validate-all.ts:64`. | closed |
| T-6-03-b | DoS | Semgrep runtime cost on every build | accept | ~30-120s on medium SwiftUI codebases is accepted; correct tradeoff for unconditional hard-fail. Caching deferred to Phase 7+. | closed |
| T-6-03-c | Info Disclosure | Semgrep output leaking file paths in terminal | accept | Existing behavior; semgrep findings already surface via `ValidationResult`. Report generation is Phase 7 OBS-02. | closed |
| T-6-04-a | Info Disclosure | Accessibility IDs on production builds | accept | Normal iOS practice; invisible to end users; only surface to accessibility trees and Maestro. No PII or sensitive data. | closed |
| T-6-04-b | Tampering | `dismiss()` from error path navigates unexpectedly | mitigate | Button labeled "Sign in instead" — explicit user intent. `dismiss()` on iOS 15+ NavigationStack returns to LoginView (push source). | closed |
| T-6-04-c | Integrity | Eta rendering breakage on added content | mitigate | Changes are plain SwiftUI text with no `<%= %>` / `<% %>` tags. Existing baas tests cover compilation path. | closed |
| T-6-05-a | Tampering | Path-traversal in tool-use `fix.path` | mitigate | ALLOWED_PREFIXES whitelist + `..` rejection + absolute-path rejection. Rejected entries silently skipped. Verified: `packages/fix/src/default-fix.ts:290-298`. | closed |
| T-6-05-b | Tampering | Fabricated content replacing legitimate code | accept | Deferred to later phase — zod-validate content length/shape. Tool-use with `strict: true` plus prefix whitelist covers realistic attack surface for solo-founder workflow. | closed |
| T-6-05-c | Info Disclosure | Fixture file leaking API keys | accept | `fixtures/tiny-mock/llm-fixtures/fix.json` contains no secrets. `DTC_LLM_MODE=fixture` is the only short-circuit. | closed |
| T-6-05-d | DoS | Response with 10000-entry `fixes` array | mitigate | `max_tokens: 16384` bounds response size. Sequential writes; large array noticed by wall-clock; synthetic paths rejected by prefix guard. | closed |
| T-6-05-e | Repudiation | Claude CLI hint leaking project internals | accept | Hint contains relative source paths — same surface as today's prompt (which already includes file contents). No new disclosure. | closed |
| T-6-05-f | Integrity | SDK version mismatch causing duplicate resolution | mitigate | All three consuming packages bumped in the same commit; pnpm-lock.yaml remains single-resolution. | closed |
| T-6-06-a | Info Disclosure | Test-user credentials in generated `.maestro/e2e/e2e-gate.yaml` | accept | Test account is throwaway, scoped to DEV Firebase project, has no privileged access. YAML regenerated every run. Future: `.gitignore` guidance (out of scope). | closed |
| T-6-06-b | Tampering | User edits YAML between runs | accept | YAML is regenerated every run (`runner.writeFile` overwrites). Persistent edits require modifying `e2e-gate.ts` itself — trust boundary is source checkout. | closed |
| T-6-06-c | DoS | Maestro flow running > 4 min (infinite simulator hang) | mitigate | `timeoutMs: 240_000` enforces hard ceiling. `runMaestro` propagates timeout to subprocess kill path. Verified: `e2e-gate.ts`. | closed |
| T-6-06-d | Integrity | `runMaestro` throws plain Error — uncaught in e2e-gate.ts | mitigate | `runMaestro` returns `MaestroResult`; exceptions surface as result's `error` field. Our only throw is `E2eGateError`. Uncaught runMaestro throws propagate to pipeline outer try/catch (Plan 06-07). | closed |
| T-6-06-e | Repudiation | E2eGateError loses context about which step failed | mitigate | Error constructor captures `flowFile` + `maestroError` (first failing result's `.error`). Full `MaestroResult` available to caller via checkpoint `failureSummary`. | closed |
| T-6-07-a | Elevation of Privilege | `--skip-validation-gate` bypasses hard-fail | mitigate | Gate is `hardFailPassed && (softFailPassed \|\| opts.skipValidationGate)`. Conjunction with `hardFailPassed` guarantees security/semgrep ALWAYS blocks regardless of flag. No `?? true` on security signals. Verified: `pipeline.ts:4098,4108`. | closed |
| T-6-07-b | Repudiation | User ships broken app and denies flag awareness | mitigate | D-16: all failures appear in `.dtc-report`. Skip branch emits explicit messaging. Flag use emitted to ProgressEmitter stream. Verified: `pipeline.ts:4169-4174`. | closed |
| T-6-07-c | DoS | `runE2eGatePhase` hangs, stalls pipeline | mitigate | `runE2eGatePhase` passes `timeoutMs: 240_000` to `runMaestro`. Pipeline catches any throw, records failure, continues to terminal gate. Max wall extension: 4 minutes. | closed |
| T-6-07-d | Integrity | Firestore pollution leaks into prod Firebase | mitigate | Gate runs against DEV Firebase project only. `firebaseSeeded` guard requires `config.baas?.provider === 'firebase'` AND `firebase_provision` checkpoint. Prod projects never provisioned by v1. | closed |
| T-6-07-e | Info Disclosure | Gate failure emit leaks user data in terminal | accept | Error messages include Maestro failure summaries (UI identifiers like `id: addItem_submit not visible`) — not PII; just UI state. Firebase test email is non-sensitive. | closed |
| T-6-07-f | Tampering | Future refactor reintroduces `?? true` on security field | mitigate | Acceptance criterion `! grep -nE "securityLintPassed\s*=.*\?\?\s*true"` guards the pattern. Comment in terminal gate explicitly forbids it. Verified: `pipeline.ts:4079-4082`. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-6-01 | T-6-00-a | Test fixtures use non-sensitive mock key strings matching existing test idiom; no real credentials present | Ray Liu | 2026-04-19 |
| AR-6-02 | T-6-00-b | Unit-scope tests with mocked deps are acceptably fast; CI budget impact negligible | Ray Liu | 2026-04-19 |
| AR-6-03 | T-6-01-a | PhaseId is a closed union with default cases; widening is safe | Ray Liu | 2026-04-19 |
| AR-6-04 | T-6-01-c | `maestroError` field exposes no new surface beyond existing `runMaestro` logging | Ray Liu | 2026-04-19 |
| AR-6-05 | T-6-02-b | One-shot pipeline-trusted file read; content drives only an integer count, no write path | Ray Liu | 2026-04-19 |
| AR-6-06 | T-6-02-d | Ranker strictly narrows project scope; does not broaden the LLM context window | Ray Liu | 2026-04-19 |
| AR-6-07 | T-6-03-b | 30-120s semgrep cost accepted as correct tradeoff for unconditional hard-fail gate | Ray Liu | 2026-04-19 |
| AR-6-08 | T-6-03-c | Semgrep file-path output is pre-existing behavior; no new disclosure | Ray Liu | 2026-04-19 |
| AR-6-09 | T-6-04-a | iOS accessibility identifiers are standard practice; no PII surface | Ray Liu | 2026-04-19 |
| AR-6-10 | T-6-05-b | Fabricated content hardening deferred to a later phase; prefix whitelist covers solo-founder threat model | Ray Liu | 2026-04-19 |
| AR-6-11 | T-6-05-c | Fixture files verified to contain no secrets; fixture mode requires explicit env var | Ray Liu | 2026-04-19 |
| AR-6-12 | T-6-05-e | Claude CLI prompt hint is same disclosure surface as existing prompt contents | Ray Liu | 2026-04-19 |
| AR-6-13 | T-6-06-a | Throwaway test account scoped to DEV project; no privileged access; YAML regenerated each run | Ray Liu | 2026-04-19 |
| AR-6-14 | T-6-06-b | User edits to generated YAML are transient; persistent tampering requires source modification | Ray Liu | 2026-04-19 |
| AR-6-15 | T-6-07-e | Maestro failure messages contain UI identifiers only; no PII; Firebase test email non-sensitive | Ray Liu | 2026-04-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-19 | 32 | 32 | 0 | gsd-security-auditor (Claude) |

### Security Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Threats found | 32 |
| Closed | 32 |
| Open | 0 |

**Key verifications performed:**
- `extractFlowIds` regex `[A-Za-z_]\w+` confirmed at `packages/analysis/src/fix-context-ranker.ts:168,171` — path-traversal sequences rejected
- `ALLOWED_PREFIXES + ..` guard confirmed at `packages/fix/src/default-fix.ts:290-298` — LLM-suggested paths sanitized
- `validate-all.ts:64` — combined guard `opts.runSecurity && baseTestsPassed` removed; semgrep now unconditional
- `pipeline.ts:4098,4108` — `hardFailPassed = semgrepPassed && securityLintPassed`; conjunction with skip-flag ensures hard-fail is never bypassable
- No `?? true` on any security-sensitive signal confirmed in terminal gate derivation

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-19
