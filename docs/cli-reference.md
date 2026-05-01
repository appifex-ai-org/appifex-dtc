# CLI Reference

> Auto-generated reference for every `dtc` subcommand. Run `dtc <cmd> --help` for the latest flags.

## Commands

- `dtc setup` — quick local setup wizard
- `dtc setup --full` — production setup: Firebase, Apple/TestFlight, Google Play, delivery, OAuth
- `dtc doctor` — verifies prerequisites (Node, Xcode, firebase-tools, ASC key, etc.)
- `dtc run` — runs the design → TestFlight pipeline
- `dtc run --resume` — resumes from last checkpoint
- `dtc run --design <file>` — design source (.pen, .fig, Stitch URL)
- `dtc run --platform <swiftui|kotlin-compose>` — codegen target
- `dtc run --baas <firebase|supabase|mock>` — backend provider

## Global flags

- `--verbose` — emits `.dtc-debug/` artefacts
- `--ci` — non-interactive mode for automation
- `--no-upload` — skip TestFlight upload (build only)

For programmatic use, `appifex-dtc` is also exposed as a library — see `@appifex/cli`'s `runPipeline` export.
