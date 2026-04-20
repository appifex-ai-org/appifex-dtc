# @appifex/spec

Design spec extraction and platform translation for the DTC toolkit.

## Usage

```typescript
import { extractSpec, translateSpec } from '@appifex/spec'

// Parse design spec from JSON
const spec = extractSpec(jsonString)

// Translate to platform-specific spec with testIDs
const swiftSpec = translateSpec(spec, 'swiftui')           // accessibilityIdentifier, SwiftUI types
const ktSpec = translateSpec(spec, 'kotlin-compose')       // testTag, Kotlin Compose types
```

## What it does

1. **Extract**: Parses a design spec JSON (from `@appifex/design`) into a typed `DesignSpec`
2. **Translate**: Maps generic components to platform-specific types and generates testIDs

The platform spec is consumed by `@appifex/test-gen` to generate tests and by `@appifex/codegen` to generate code.
