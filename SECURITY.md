# Security Policy

## Reporting a Vulnerability

Please report security issues privately to **dev@appifex.ai**. Do not open public GitHub issues for security findings.

Include:
- A clear description of the issue
- Steps to reproduce
- Affected versions
- Suggested mitigation if known

We aim to acknowledge reports within 72 hours and provide a remediation timeline within 7 days.

## Supported Versions

Only the latest minor version of each `@appifex/*` package on npm receives security updates.

## Disclosure

We follow coordinated disclosure: a fix and CVE (if applicable) ship before public details are published. Reporters are credited in the changelog unless they request otherwise.

---

## Phase 03 Threat Audit (setup-and-diagnostics)

**Audit date:** 2026-04-16
**ASVS Level:** L1

### Accepted Risks

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-03-01-02 | Tampering | .p8 path is user-controlled from their own config; no privilege boundary crossed |
| T-03-01-06 | Elevation of Privilege | `jose` is an external npm dependency; mitigated by npm audit + CI gate |
| T-03-02-02 | Spoofing | DNS redirect to phishing endpoint is out of scope; OS trust store + HTTPS enforced |
| T-03-02-04 | Tampering | `DTC_LLM_MODE=fixture` is an opt-in CI env var; production environments will not have it set |
| T-03-02-05 | Repudiation | Preflight failure logging deferred to Phase 7 OBS-02 |
| T-03-03-02 | Spoofing | Malicious .p8 path pointing at /etc/shadow is user-controlled; no privilege boundary |
| T-03-03-04 | Denial of Service | @clack/prompts buffers stdin; no unbounded allocation |
| T-03-03-06 | Repudiation | Setup audit trail deferred to Phase 7 OBS-02 |
| T-03-04-02 | Spoofing | Attacker-controlled $PATH replacing firebase binary is outside threat model (user-level) |
| T-03-04-04 | Denial of Service | Network hang during firebase projects:create deferred to firebase-tools internal timeouts |
| T-03-04-07 | Tampering | Project name collision requires victim's active session; fails at create-time |
| T-03-04-08 | Elevation of Privilege | firebase-tools supply-chain risk; user installs themselves |
| T-03-05-02 | Tampering | Same posture as T-03-01-02 |
| T-03-05-04 | Spoofing | Same $PATH posture as T-03-04-02 |
| T-03-05-06 | Repudiation | Doctor result persistence deferred to Phase 7 OBS-02 |

### Transferred Risks

| Threat ID | Category | Transfer Target |
|-----------|----------|-----------------|
| T-03-04-05 | Information Disclosure | GoogleService-Info.plist .gitignore generation deferred to Phase 4 codegen templates. Documented in `cli/src/setup/firebase.ts:139` inline comment and plan 03-04 SUMMARY. |

### Open Threats

None — all mitigated threats verified closed.

### Fixed During Audit

| Threat ID | Fix | Commit |
|-----------|-----|--------|
| T-03-02-03 | Added `AbortSignal.timeout(5_000)` to `probeAscLive` fetch + `AbortError → TRANSIENT` in catch (`packages/core/src/asc-jwt.ts:55,62`) | 2026-04-16 |
