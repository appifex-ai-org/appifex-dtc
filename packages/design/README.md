# @dtc/design

AI design generation with pluggable adapters for the DTC toolkit.

## Usage

```typescript
import { PencilAdapter } from '@dtc/design'
import { LocalRunner } from '@dtc/runner'

const runner = new LocalRunner(process.cwd())
const pencil = new PencilAdapter(runner, { cliKey: process.env.PENCIL_CLI_KEY! })

// Create a new design
const result = await pencil.create({
  prompt: 'Pet adoption app with browse, favorites, adoption form',
  outputPath: 'design.pen',
  exportPath: 'preview.png',
})

// Iterate on existing design
await pencil.iterate({
  inputPath: 'design.pen',
  outputPath: 'design.pen',
  prompt: 'Make cards 2-column grid with shadows, add heart icons',
})
```

## Adapters

| Adapter | Tool | Status |
|---------|------|--------|
| `PencilAdapter` | Pencil CLI | Implemented |
| `StitchAdapter` | Google Stitch | Planned |
