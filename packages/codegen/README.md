# @appifex/codegen

Pluggable code generation adapter for the DTC toolkit. Accepts a design spec and test files, produces source code.

## Usage

```typescript
import { ClaudeAdapter } from '@appifex/codegen'
import { LocalRunner } from '@appifex/runner'

const adapter = new ClaudeAdapter({
  generateFn: async (input) => {
    // Call your LLM here with input.spec and input.uiTestPaths
    return { success: true, files: [...], tokensUsed: 5000 }
  },
})

// Generate code
const result = await adapter.generate({ spec, uiTestPaths, unitTestPaths, outputDir: './src' })

// Or generate and write to disk in one step
const runner = new LocalRunner(process.cwd())
await adapter.generateAndWrite(input, runner)
```

## Custom adapters

Implement the `CodegenAdapter` interface to use any code generation backend:

```typescript
import type { CodegenAdapter } from '@appifex/codegen'

const myAdapter: CodegenAdapter = {
  name: 'my-custom',
  async generate(input) {
    return { success: true, files: [...], tokensUsed: 0 }
  },
}
```
