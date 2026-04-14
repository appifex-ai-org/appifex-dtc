# @dtc/build

Build SwiftUI and Kotlin Compose projects via a Runner abstraction.

## Usage

```typescript
import { buildSwift, buildKotlinCompose } from '@dtc/build'
import { LocalRunner } from '@dtc/runner'

const runner = new LocalRunner(process.cwd())

// SwiftUI: xcodebuild
const swiftResult = await buildSwift(runner, {
  projectDir: './pet-app-ios',
  scheme: 'PetApp',
  destination: 'platform=iOS Simulator,name=iPhone 16',
})

// Kotlin Compose: Gradle
const ktResult = await buildKotlinCompose(runner, { projectDir: './pet-app-android' })

if (swiftResult.success) console.log('Swift build succeeded')
if (ktResult.success) console.log('Kotlin Compose build succeeded')
```

The Runner abstraction means the same build commands work locally, in E2B, or on a Mac Runner.
