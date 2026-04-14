import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Platform } from '@appifex/core'

// ── Unit Test Instructions ──

export function buildUnitTestInstructions(platform: Platform, appName: string): string {
  if (platform === 'swiftui') {
    return `## Unit Tests (YOU write these — make them meaningful)

Do NOT use stubs like \`XCTAssertTrue(true)\`. Write real tests.
Use \`@testable import ${appName}\` in all test files.

1. **Model tests** (\`__tests__/ModelTests.swift\`): instantiation, properties, Codable round-trip
2. **ViewModel tests** (\`__tests__/ViewModelTests.swift\`): initial state, add/delete/toggle actions, edge cases
3. **View tests** (\`__tests__/ViewTests.swift\`): each view instantiates without crashing

Example of a GOOD test:
\`\`\`swift
import XCTest
@testable import ${appName}

func testAddTodo() {
    let vm = TodoViewModel()
    vm.addTodo(title: "Buy milk")
    XCTAssertEqual(vm.todos.count, 1)
    XCTAssertEqual(vm.todos.first?.title, "Buy milk")
}
\`\`\``
  }

  if (platform === 'kotlin-compose') {
    return `## Unit Tests (YOU write these — make them meaningful)

Do NOT use stubs like \`assertTrue(true)\`. Write real tests.

1. **ViewModel tests** (\`app/src/test/java/.../ViewModelTest.kt\`): initial state, state updates, coroutine actions
2. **Compose UI tests** (\`app/src/androidTest/java/.../ScreenTest.kt\`): use \`createComposeRule()\`, \`onNodeWithTag()\`, \`assertExists()\`
3. **Model tests** (\`app/src/test/java/.../ModelTest.kt\`): data class creation, serialization

Example of a GOOD test:
\`\`\`kotlin
@Test
fun testAddTodo() {
    val viewModel = TodoViewModel()
    viewModel.addTodo("Buy milk")
    assertEquals(1, viewModel.uiState.value.todos.size)
    assertEquals("Buy milk", viewModel.uiState.value.todos.first().title)
}
\`\`\``
  }

  return buildUnitTestInstructions('kotlin-compose', appName)
}

// ── Maestro flow inlining ──

export function inlineMaestroFlows(flowDir: string): string | null {
  if (!existsSync(flowDir)) return null

  const parts: string[] = []
  for (const file of readdirSync(flowDir).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
  )) {
    const content = readFileSync(join(flowDir, file), 'utf-8')
    parts.push(`### ${file}\n\`\`\`yaml\n${content}\n\`\`\``)
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}

// ── Skills ──

export function buildSkillsSection(
  skillsDir: string,
  platform: Platform,
  projectDir: string,
): string {
  const relSkills = relative(projectDir, skillsDir)
  const rows = [`| Before writing code | \`${relSkills}/${platform}/codegen/01-architecture.md\` |`]
  if (platform === 'swiftui') {
    rows.push(
      `| Complex app (3+ screens, multiple data sources) | \`${relSkills}/${platform}/codegen/09-clean-architecture.md\` |`,
    )
    rows.push(
      `| Writing unit tests / mock patterns | \`${relSkills}/${platform}/codegen/10-testing-patterns.md\` |`,
    )
  }
  rows.push(
    `| Deprecated API errors | \`${relSkills}/${platform}/codegen/02-deprecated-apis.md\` |`,
    `| Compilation safety | \`${relSkills}/${platform}/codegen/04-compilation-safety.md\` |`,
    `| Concurrency errors | \`${relSkills}/${platform}/fix/03-concurrency-errors.md\` |`,
  )
  if (platform === 'swiftui') {
    rows.push(`| SwiftData/XcodeGen | \`${relSkills}/${platform}/fix/04-swiftdata-xcodegen.md\` |`)
  }

  return `## Skills (read on-demand)

Skill files at \`${relSkills}/\`. Read only when you need help with a specific error.

| When | File |
|---|---|
${rows.join('\n')}`
}

// ── Architecture ──

export function buildArchitectureRules(platform: Platform): string {
  if (platform === 'swiftui') {
    return `## Architecture Rules (SwiftUI)

- Source files in \`Sources/\` subdirectories
- Do NOT create \`@main\` — \`App.swift\` already exists
- Set \`.accessibilityIdentifier("id")\` on ALL interactive/visible elements
- \`Sources/Models/\` — structs (Identifiable, Codable)
- \`Sources/Services/\` — persistence, business logic
- \`Sources/Views/\` — one SwiftUI file per screen
- \`Sources/ContentView.swift\` — root navigation (TabView if design has tabs!)
- \`Sources/ViewModels/\` — @Observable classes
- Do NOT modify: \`project.yml\`, \`App.xcodeproj/\`, \`Info.plist\`
- Use @Observable (not ObservableObject)
- Match the design's navigation pattern exactly (if it shows a tab bar, use TabView)
- Root container MUST use \`.background(Color(...).ignoresSafeArea())\` so the background extends edge-to-edge behind the status bar and home indicator (no black bars)`
  }

  if (platform === 'kotlin-compose') {
    return `## Architecture Rules (Kotlin Compose)

- Source files in \`app/src/main/java/com/dtc/app/\` subdirectories
- Do NOT modify \`MainActivity.kt\` — it already sets up \`testTagsAsResourceId\`
- Set \`Modifier.testTag("id")\` on ALL interactive/visible composables
- \`data/models/\` — data classes (Serializable)
- \`data/repository/\` — data access, API calls
- \`ui/screens/\` — one Composable file per screen
- \`ui/components/\` — reusable composables
- \`ui/viewmodels/\` — ViewModel classes with StateFlow
- \`ui/theme/\` — Material 3 theme (Color.kt, Theme.kt, Type.kt)
- \`ui/navigation/\` — NavHost with type-safe routes
- Use ViewModel + StateFlow (not mutableStateOf in ViewModels)
- Match the design's navigation pattern (if it shows bottom nav, use NavigationBar)`
  }

  return buildArchitectureRules('kotlin-compose')
}

// ── Build Commands ──

export function buildInstructions(platform: Platform, appName: string): string {
  if (platform === 'swiftui') {
    return `## Build & Test Commands

- \`xcodegen generate\` — regenerate Xcode project
- \`xcodebuild build -scheme ${appName} -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1\`
- \`xcodebuild test -scheme ${appName} -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1\`
- \`maestro test .maestro/ 2>&1\` (after unit tests pass)

The project name is **${appName}**. The scheme, target, and module are all named \`${appName}\`.
Always run \`xcodegen generate\` before \`xcodebuild\`.`
  }

  if (platform === 'kotlin-compose') {
    return `## Build & Test Commands

- \`./gradlew assembleDebug 2>&1\` — build the APK
- \`./gradlew test 2>&1\` — run local unit tests (JVM)
- \`adb install -r app/build/outputs/apk/debug/app-debug.apk\` — install on emulator
- \`adb shell am start -n com.dtc.app/.MainActivity\` — launch the app
- \`adb exec-out screencap -p > screenshot.png\` — take screenshot
- \`maestro test .maestro/ 2>&1\` — run Maestro UI tests`
  }

  return buildInstructions('kotlin-compose', appName)
}

// ── Workflow ──

export function buildWorkflow(platform: Platform, appName: string): string {
  if (platform === 'swiftui') {
    return `## Workflow

### Phase 1: Study the Design (CRITICAL)
1. The design image is attached to this message. Study it carefully NOW.
2. WRITE DOWN what you see: how many screens, navigation type (tabs? stack?), exact color scheme, layout of each screen, typography, icons
3. Compare what you see vs what the spec says. If they differ, TRUST THE IMAGE.
4. Read \`skills/swiftui/codegen/01-architecture.md\`

### Phase 2: Plan the Architecture
5. Based on what you SEE in the design, plan:
   - How many screens/views to create (match the design exactly)
   - Navigation structure (TabView with N tabs? NavigationStack?)
   - What models/data structures are needed
   - Define the color scheme as constants (use the EXACT colors from the design, not defaults)

### Phase 3: Write Tests (TDD)
6. Write unit tests in \`__tests__/\` based on the design's actual functionality
7. Model tests, ViewModel tests, View instantiation tests

### Phase 4: Implement Models & ViewModels
8. \`Sources/Models/\` — data structs matching what you see in the design
9. \`Sources/Services/\` — persistence, sample data
10. \`Sources/ViewModels/\` — @Observable classes

### Phase 5: Implement Views (match the design!)
11. For EACH screen visible in the design image, create a view file
12. Match colors, spacing, typography, layout exactly as shown in the design
13. Set \`.accessibilityIdentifier()\` on all elements
14. Create \`ContentView.swift\` with the correct navigation pattern from the design

### Phase 6: Build & Fix
15. \`xcodegen generate && xcodebuild build -scheme ${appName} -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1\`
16. Fix build errors, rebuild until clean

### Phase 7: Unit Tests & Fix
17. \`xcodebuild test -scheme ${appName} -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1\`
18. Fix test failures, re-run until all pass

### Phase 8: Screenshot Test — Compare Against Design (MANDATORY)
19. Boot a simulator if needed: \`xcrun simctl boot "iPhone 16" 2>&1\`
20. Install the app: \`xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/${appName}.app 2>&1\`
21. Launch the app: \`xcrun simctl launch booted com.dtc.${appName} 2>&1\`
22. **Check for crash immediately**: \`sleep 2 && xcrun simctl get_app_container booted com.dtc.${appName} 2>&1\`
    - If the command fails with "No such process" or similar, the app crashed on launch
    - Check crash details: \`log show --predicate 'process == "${appName}"' --last 30s --style compact 2>&1 | tail -20\`
    - Fix the crash cause (usually a force-unwrap, missing @MainActor, or bad init) and rebuild before continuing
23. Take a screenshot: \`xcrun simctl io booted screenshot screenshot.png 2>&1\`
24. Read the screenshot: use the Read tool on \`screenshot.png\`
25. Compare the screenshot against the design image (\`preview.png\`) — read both and compare:
    - Are the colors correct? (Check primary color, background, accents)
    - Is the navigation structure correct? (Tab bar? Correct number of tabs?)
    - Are all screens/components present?
    - Is the layout correct? (Spacing, alignment, component positions)
26. If there are visual differences, fix the views and repeat from step 15 (rebuild, reinstall, re-screenshot)
27. Keep iterating until the screenshot matches the design

### Phase 9: Maestro UI Tests (MANDATORY)
28. Run \`maestro test .maestro/ 2>&1\` to verify accessibilityIdentifiers
29. If Maestro tests fail:
    - First check if the app is still running: \`xcrun simctl get_app_container booted com.dtc.${appName} 2>&1\`
    - If the app crashed, check logs: \`log show --predicate 'process == "${appName}"' --last 60s --style compact 2>&1 | tail -30\`
    - Fix crash/identifier issues and re-run until all pass

You are NOT done until ALL of these pass: build, unit tests, screenshot matches design, AND Maestro UI tests.`
  }

  if (platform === 'kotlin-compose') {
    return `## Workflow

### Phase 1: Study the Design (CRITICAL)
1. The design image is attached. Study it carefully NOW.
2. WRITE DOWN what you see: how many screens, navigation type (bottom nav? drawer?), color scheme, layout, typography, icons
3. Compare with the spec JSON. If they differ, TRUST THE IMAGE.
4. Read \`skills/kotlin-compose/codegen/01-architecture.md\` if available

### Phase 2: Plan the Architecture
5. Based on the design, plan:
   - How many screens/composables to create
   - Navigation structure (NavigationBar with N items? NavHost stack?)
   - What data classes and ViewModels are needed
   - Define Material3 theme colors matching the design

### Phase 3: Write Tests (TDD)
6. Write ViewModel unit tests in \`app/src/test/java/\`
7. Write Compose UI tests in \`app/src/androidTest/java/\` using \`createComposeRule()\`

### Phase 4: Implement Models & ViewModels
8. \`data/models/\` — data classes
9. \`data/repository/\` — data access
10. \`ui/viewmodels/\` — ViewModel with StateFlow

### Phase 5: Implement Composables (match the design!)
11. For EACH screen in the design, create a composable file
12. Match colors, spacing, typography exactly from the design
13. Set \`Modifier.testTag("id")\` on all interactive elements
14. Create \`ui/navigation/AppNavigation.kt\` with the correct navigation pattern

### Phase 6: Build & Fix
15. \`./gradlew assembleDebug 2>&1\` — fix errors, rebuild until clean

### Phase 7: Unit Tests
16. \`./gradlew test 2>&1\` — fix failures, re-run until all pass

### Phase 8: Screenshot Test — Compare Against Design
17. \`adb install -r app/build/outputs/apk/debug/app-debug.apk\`
18. \`adb shell am start -n com.dtc.app/.MainActivity\`
19. \`adb exec-out screencap -p > screenshot.png\`
20. Compare screenshot against \`preview.png\` — fix visual differences

### Phase 9: Maestro UI Tests (MANDATORY)
21. \`maestro test .maestro/ 2>&1\`
22. Fix any failing testTag assertions, re-run until all pass

You are NOT done until build, unit tests, screenshot matches design, AND Maestro UI tests all pass.`
  }

  return buildWorkflow('kotlin-compose', appName)
}
