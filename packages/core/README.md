# @appifex/core

Shared types, progress emitter, token budget, checkpoint, and configuration for the DTC toolkit.

## Usage

```typescript
import {
  loadConfig, saveConfig,
  ProgressEmitter, terminalProgressListener,
  TokenBudget,
  Checkpoint,
} from '@appifex/core'

// Config
const config = await loadConfig('~/.dtc')
await saveConfig('~/.dtc', { ...config, llm: { provider: 'anthropic', apiKey: 'sk-...' } })

// Progress
const progress = new ProgressEmitter()
progress.on(terminalProgressListener(console.log))
progress.emit({ phase: 'design', status: 'started', message: 'Creating design', timestamp: Date.now() })

// Token budget
const budget = new TokenBudget({ total: 100_000, perPhase: { design: 30_000 } })
budget.consume('design', 5_000)
budget.canConsumePhase('design', 25_001) // false

// Checkpoint (SQLite)
const ckpt = new Checkpoint('/tmp/pipeline.db')
ckpt.savePhase('run-1', 'design', { penFile: 'design.pen' })
ckpt.getPhase('run-1', 'design') // { penFile: 'design.pen' }
ckpt.close()
```

## Modules

| Module | Purpose |
|--------|---------|
| `types` | All shared TypeScript types (`DesignSpec`, `Runner`, `ProgressEvent`, `FixResult`, etc.) |
| `config` | Load/save `~/.dtc/config.json` with sensible defaults |
| `progress` | Typed event emitter for pipeline progress with terminal formatter |
| `token-budget` | Per-phase and total token tracking with limit enforcement |
| `checkpoint` | SQLite-backed pipeline state persistence for crash recovery |
