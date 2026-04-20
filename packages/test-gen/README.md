# @appifex/test-gen

Generate all tests (UI + unit) before code. This is the "tests first" step of the two-layer TDD approach.

## Usage

```typescript
import { generateUITests, generateUnitTests } from '@appifex/test-gen'

// Generate Maestro UI test flows from platform spec
const flows = generateUITests(platformSpec)
// → [{ name: 'Browse Pets', fileName: 'browse-pets.yaml', content: '...' }, ...]

// Generate unit tests from business requirements
const files = generateUnitTests(
  ['Filter pets by type', 'Add and remove favorites', 'Validate adoption form'],
  'swiftui',
)
// → [{ fileName: 'RequirementsTests.swift', content: '...', testCount: 3 }]
```

## What it generates

| Type | Platform | Output |
|------|----------|--------|
| UI tests | swiftui | Maestro YAML flows with `assertVisible` + `tapOn` |
| UI tests | kotlin-compose | Maestro YAML flows (same format) |
| Unit tests | swiftui | XCTest `.swift` files |
| Unit tests | kotlin-compose | JUnit `.kt` files |

Generated tests are **locked** — they become the contract that code generation must satisfy.
