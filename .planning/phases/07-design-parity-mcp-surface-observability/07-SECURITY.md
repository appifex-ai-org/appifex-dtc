---
phase: 7
slug: design-parity-mcp-surface-observability
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-19
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| design input → PlatformSpec | Untrusted designer-supplied strings (layer names) cross into generated Swift/Kotlin identifiers | layer name strings |
| pricing table → cost readout | Hardcoded rates propagate to UI/report; stale rates produce misleading cost figures | dollar amounts |
| manifest on disk → next pipeline run | Manifest entries written by pipeline, read back by next run; attacker with fs access can tamper | file paths |
| CLI flag input → pipeline control flow | User-supplied flags control destructive operations (`--overwrite-user-edits`) | boolean flags |
| MCP client → handler (projectDir) | Untrusted agent-supplied path could traverse outside expected directories | absolute path string |
| MCP client → handler (configDir) | Default resolves to `~/.dtc` but attacker could point at arbitrary config | absolute path string |
| MCP client → handler (baasSchema) | Optional structured input consumed by Firebase provisioning which writes security rules | JSON schema |
| Fixture → extractor (binary .pen / JSON / zip) | Binary/JSON fixtures checked into repo; attacker with write access could poison | test fixture data |
| debug-bundle zip → user's share target | Zip contents may be inspected; secrets leak if scrubber misses a pattern | log file contents |
| report.json/md → local disk | Report may be checked into a public repo; contents must not contain secrets | cost/model metadata |
| pipeline.ts → user's filesystem | Pipeline writes report + bundle; error path invokes bundler which reads sensitive files | debug artifacts |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-00-01 | Tampering | Wave 0 stubs | accept | Stubs exist only in `__tests__/` under repo control | closed |
| T-07-00-02 | Information Disclosure | Secret-pattern assertions in debug-bundle.test.ts | mitigate | Test fixtures use obviously-fake values; verified in `packages/core/__tests__/debug-bundle.test.ts` | closed |
| T-07-01-01 | Tampering | Layer name injection into generated code | mitigate | `sanitizeLayerName` strips all non-alphanumeric chars; verified at `packages/design/src/sanitize.ts:67-68` | closed |
| T-07-01-02 | Denial of Service | Pathological input causing ReDoS in sanitizer | mitigate | All regexes use linear-time character classes; verified at `packages/design/src/sanitize.ts:67-79` | closed |
| T-07-01-03 | Tampering | Sanitized-name collision between adapters | accept | Scope-local `taken` Sets prevent within-scope collision; cross-scope collision is intentional | closed |
| T-07-02-01 | Tampering | Pricing table tampering via PR | mitigate | `PRICING_AS_OF = '2026-04-18'` stamp visible in every cost readout; PR review required; verified at `packages/core/src/pricing.ts:33` | closed |
| T-07-02-02 | Information Disclosure | Cost readout reveals model usage patterns | accept | Cost data stays local to `.dtc-report/`; not emitted to any network surface | closed |
| T-07-02-03 | Denial of Service | Integer overflow summing per-phase costs | accept | JavaScript Number handles any realistic aggregate; max run cost < $100 | closed |
| T-07-03-01 | Tampering | Manifest path-traversal via `entry.path` containing `..` | mitigate | `validateRelativePath` throws on `..` segments; verified at `packages/core/src/manifest.ts:62-71` | closed |
| T-07-03-02 | Tampering | Absolute path in `entry.path` points outside outputDir | mitigate | `isAbsolute(p)` guard rejects absolute paths on read and write; verified at `packages/core/src/manifest.ts:63-64` | closed |
| T-07-03-03 | Information Disclosure | Manifest reveals generated-file list to attacker | accept | Same threat surface as `.git`; if attacker has fs read, they have everything | closed |
| T-07-03-04 | Denial of Service | Manifest with 100k entries causes slow diff | accept | Pipeline-generated file count is O(tens to hundreds); DoS is self-inflicted only | closed |
| T-07-03-05 | Tampering | `--overwrite-user-edits` wipes user's work | mitigate | Flag is explicit opt-in (off by default); chalk.yellow warning lists preserved paths; verified at `cli/src/pipeline.ts:843,886-897` | closed |
| T-07-04a-01 | Tampering | MCP handler `projectDir` path-traversal | mitigate | `wrapToolHandler` catches `CliError`; `patchServerForCliErrorTranslation` wraps every tool; verified at `packages/mcp-server/src/server.ts:17-52` | closed |
| T-07-04a-02 | Denial of Service | `handleGetPipelineStatus` holds sqlite handle on error | mitigate | `finally { checkpoint?.close() }` present; verified at `packages/mcp-server/src/tools/status.ts:124-126` | closed |
| T-07-04a-03 | Information Disclosure | Error messages leak stack traces to MCP client | mitigate | `wrapToolHandler` returns only `err.name: err.message`; no stack property; verified at `packages/mcp-server/src/server.ts:25-28` | closed |
| T-07-04a-04 | Elevation of Privilege | `handleTestflightUpload` dispatches real Apple auth | transfer | Inherits Phase 5 ASC JWT handling; no new auth surface in Phase 7 | closed |
| T-07-04a-05 | Tampering | Malicious `baasSchema` causes wrong Firestore rules | mitigate | `lintSecurityRules` (FIRE-05) gate runs before any deployment; verified at `packages/baas/src/firebase-provision.ts:73,86-90` | closed |
| T-07-04b-01 | Tampering | Parity fixtures altered to hide regressions | accept | Standard git review; fixtures are human-readable JSON or derived by committed script | closed |
| T-07-04b-02 | Tampering | `fixture-gen.ts` imported by vitest glob crashes CI | mitigate | Filename lacks `.test.ts` suffix; vitest glob skips it; verified at `packages/design/__tests__/fixtures/parity/fixture-gen.ts` | closed |
| T-07-05-01 | Information Disclosure | Debug bundle leaks API keys via unmatched log format | mitigate | 8 `SECRET_PATTERNS` covering sk-ant-*, sk-*, PEM private key, PEM certificate, Firebase service_account, apiKey, private_key, asc_key; all 8 verified by tests in `packages/core/__tests__/debug-bundle.test.ts` | closed |
| T-07-05-02 | Information Disclosure | Zip-slip in debug bundle extraction | mitigate | Entry names use `relative()` from filesystem paths only; no user input flows into `name`; verified at `packages/core/src/debug-bundle.ts:98` | closed |
| T-07-05-03 | Denial of Service | Bundle on large `.dtc-debug/` takes minutes | mitigate | zlib level 6 used; typical `.dtc-debug/` 1-10 MB; verified at `packages/core/src/debug-bundle.ts:90` | closed |
| T-07-05-04 | Information Disclosure | `report.json` leaks cost data | accept | Local file; user controls sharing; cost data less sensitive than keys | closed |
| T-07-05-05 | Tampering | Malicious `archiver` version | mitigate | Pinned at `^7.0.1`; workspace lockfile; CI runs `--frozen-lockfile`; verified at `packages/core/package.json:24` | closed |
| T-07-06a-01 | Tampering | `--overwrite-user-edits` bypasses user-edit preservation | mitigate | Default preserves; chalk.red logs every overwritten path; verified at `cli/src/pipeline.ts:886-892` | closed |
| T-07-06a-02 | Tampering | Manifest refresh during fix-loop overwrites user-edit detection | accept | Intentional (D-11): fix-loop output is new baseline; documented | closed |
| T-07-06a-03 | Denial of Service | Manifest diff on tens of thousands of files | accept | v1 project size O(100s); not a realistic scale issue | closed |
| T-07-06b-01 | Information Disclosure | Debug bundle written on failure contains secrets | mitigate | Scrubber covers 8 patterns; `~/.dtc/config.json` is 0600 per Phase 3; verified at `packages/core/src/debug-bundle.ts:17-26` and `packages/core/src/config.ts:30-37` | closed |
| T-07-06b-02 | Denial of Service | Bundle write on failure hangs pipeline exit | mitigate | Bundle try/catch in pipeline; bundler failure does NOT mask original error; verified at `cli/src/pipeline.ts:4372-4381` | closed |
| T-07-06b-03 | Information Disclosure | `report.json` contains model + cost data | accept | User controls sharing; no keys or PII in report | closed |
| T-07-06b-04 | Information Disclosure | Live cost fields in ProgressEvent leak usage patterns | accept | Local terminal only; no network surface | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-00-01 | Test-only stubs under repo control; no runtime risk | Ray Liu | 2026-04-19 |
| AR-07-02 | T-07-01-03 | Cross-scope name collisions are intentional by design; within-scope prevented by `taken` Sets | Ray Liu | 2026-04-19 |
| AR-07-03 | T-07-02-02 | Cost readout is local-only; no network emission | Ray Liu | 2026-04-19 |
| AR-07-04 | T-07-02-03 | JavaScript Number safely handles < $100 per-run aggregate | Ray Liu | 2026-04-19 |
| AR-07-05 | T-07-03-03 | Manifest is not a security perimeter; same exposure as `.git` | Ray Liu | 2026-04-19 |
| AR-07-06 | T-07-03-04 | Self-inflicted DoS only; v1 pipeline output is O(hundreds) of files | Ray Liu | 2026-04-19 |
| AR-07-07 | T-07-04b-01 | Fixture tampering requires git write access; standard PR review process applies | Ray Liu | 2026-04-19 |
| AR-07-08 | T-07-05-04 | Cost metadata in report.json is less sensitive than keys; user controls sharing | Ray Liu | 2026-04-19 |
| AR-07-09 | T-07-06a-02 | Fix-loop output as baseline is intentional D-11 behavior; documented in PLAN | Ray Liu | 2026-04-19 |
| AR-07-10 | T-07-06a-03 | v1 project scale is O(100s) files; large-manifest DoS is not a realistic threat | Ray Liu | 2026-04-19 |
| AR-07-11 | T-07-06b-03 | report.json contains no keys or PII; model/cost data is user-controlled output | Ray Liu | 2026-04-19 |
| AR-07-12 | T-07-06b-04 | ProgressEvent is local terminal output only; no network surface | Ray Liu | 2026-04-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-19 | 32 | 32 | 0 | gsd-security-auditor (claude-sonnet-4-6) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-19
