# appifex-dtc

> Design to TestFlight in one command.

[![CI](https://github.com/appifex/appifex-dtc/actions/workflows/ci.yml/badge.svg)](https://github.com/appifex/appifex-dtc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@appifex/cli.svg)](https://www.npmjs.com/package/@appifex/cli)

`dtc` is a CLI that turns design files (Pencil / Figma / Stitch) into production-ready SwiftUI + Firebase apps deployed to TestFlight — no manual Xcode or Firebase Console steps.

## Install

```bash
npm install -g @appifex/cli
# or
pnpm dlx @appifex/cli setup
```

Requires Node ≥22, pnpm ≥9, macOS with Xcode 15+.

## Quickstart

```bash
dtc setup            # one-time: capture LLM, Apple ASC, Firebase creds
dtc run --design my-app.pen --platform swiftui
# → SwiftUI project generated, Firebase wired, archive uploaded to TestFlight
```

See [docs/getting-started.md](docs/getting-started.md) for the full walkthrough.

## Documentation

- [Getting Started](docs/getting-started.md)
- [CLI Reference](docs/cli-reference.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT — see [LICENSE](LICENSE).

Sun 19 Apr 2026 20:28:30 NZST
