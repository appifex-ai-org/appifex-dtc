# @dtc/report

Generate final pipeline reports with test results, fix history, and token usage.

## Usage

```typescript
import { buildReport, formatMarkdown, formatJson } from '@dtc/report'

const report = buildReport({
  projectName: 'Pet Adoption App',
  platforms: ['swiftui', 'kotlin-compose'],
  designIterations: 2,
  validation: { swiftui: swiftValidation, 'kotlin-compose': ktValidation },
  fix: { swiftui: swiftFix },
  tokenUsage: { design: 5000, codegen: 15000, fix: 3400 },
  totalDuration: 120000,
})

// Output as Markdown
console.log(formatMarkdown(report))

// Output as JSON
fs.writeFileSync('report.json', formatJson(report))
```

## Report contents

- Project summary (total tests, pass rate, fix attempts, tokens)
- Per-platform breakdown (UI tests, unit tests, fix results)
- Token usage by phase
