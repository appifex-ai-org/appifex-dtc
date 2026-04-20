# @appifex/runner

Execution environment abstraction for the DTC toolkit. The same tools work locally, in E2B cloud sandboxes, or on remote Mac Runners.

## Usage

```typescript
import { createRunner, LocalRunner, E2BRunner, RemoteRunner } from '@appifex/runner'

// Factory (reads from DtcConfig.runner)
const runner = createRunner({ type: 'local' })

// Or create directly
const local = new LocalRunner(process.cwd())
const e2b = new E2BRunner({ sandboxId: 'sbx-123', apiKey: 'e2b-key' })
const remote = new RemoteRunner({ runnerUrl: 'https://mac.local:8443', runnerToken: 'amr_tok' })

// All runners share the same interface
const result = await runner.exec('echo', ['hello'])
// { exitCode: 0, stdout: 'hello\n', stderr: '', duration: 12 }

await runner.writeFile('/app/index.ts', 'console.log("hi")')
const code = await runner.readFile('/app/index.ts')
const exists = await runner.exists('/app/package.json')
const files = await runner.glob('/app/**/*.ts')

// Capability detection
runner.capabilities.hasXcode   // true on Mac Runner, false on E2B
runner.capabilities.hasMaestro // true when maestro CLI is available
runner.capabilities.platform   // 'darwin' or 'linux'
```

## Runners

| Runner | Platform | Use case |
|--------|----------|----------|
| `LocalRunner` | darwin/linux | Standalone developer, CI |
| `E2BRunner` | linux | Cloud sandbox |
| `RemoteRunner` | darwin | Swift/Xcode builds on Mac Runner |
