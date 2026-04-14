# @dtc/validate

Run all tests (Maestro UI + XCTest/JUnit unit) and get unified results.

## Usage

```typescript
import { validateAll, runMaestro, runUnitTests } from '@dtc/validate'
import { LocalRunner } from '@dtc/runner'

const runner = new LocalRunner(process.cwd())

// Run everything
const result = await validateAll(runner, {
  platform: 'swiftui',
  projectDir: './pet-app',
  flowDir: '.maestro/',
  testDir: 'Tests/',
  reportDir: '/tmp/maestro-report',
})

console.log(result.allPassed) // true/false
console.log(`UI: ${result.ui.passed}/${result.ui.total}`)
console.log(`Unit: ${result.unit.passed}/${result.unit.total}`)

// Or run individually
const uiResults = await runMaestro(runner, { flowDir: '.maestro/', projectDir: './app', reportDir: '/tmp/report' })
const unitResults = await runUnitTests(runner, { platform: 'swiftui', projectDir: './app', testDir: 'Tests/' })
```

Includes a JUNIT XML parser for Maestro, XCTest, and JUnit results.
