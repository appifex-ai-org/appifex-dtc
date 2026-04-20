# @appifex/fix

TDD red-to-green fix loop with multi-layer circuit breakers.

## Usage

```typescript
import { fixLoop } from '@appifex/fix'

const result = await fixLoop(initialValidation, {
  fixFn: async (failures) => {
    // Call your LLM to generate fixes based on failures
    return { filesChanged: ['Home.tsx'], tokensUsed: 1000 }
  },
  buildFn: async () => buildReactNative(runner, { projectDir: './app' }),
  validateFn: async () => validateAll(runner, { ... }),
  maxAttempts: 5,
  tokenBudget: 50_000,
})

if (result.status === 'all_green') {
  console.log(`Fixed in ${result.attempts.length} attempts!`)
} else {
  console.log(`Stopped: ${result.circuitBreakReason}`)
  console.log(`Recommendation: ${result.recommendation}`)
}
```

## Circuit breakers

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Max attempts | configurable (default 5) | Stop, report |
| Same error repeated | 3 identical failures | Stop, unfixable |
| No progress | 2 attempts, zero test delta | Stop, going in circles |
| Regression | More tests failing | Rollback, stop |
| Token budget | Phase budget depleted | Stop, surface to user |
| Timeout | Configurable | Stop, partial results |

## Recommendations

On circuit break, returns a `recommendation`: `manual_fix`, `simplify_design`, `relax_tests`, `split_and_retry`, or `add_budget`.
