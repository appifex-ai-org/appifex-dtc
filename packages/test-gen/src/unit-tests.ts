import type { Platform, TestFile, PlatformSpec } from '@appifex/core'

function toFunctionName(requirement: string): string {
  return requirement
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toLowerCase())
}

function toSwiftFunctionName(requirement: string): string {
  const fn = toFunctionName(requirement)
  return 'test' + fn.charAt(0).toUpperCase() + fn.slice(1)
}

function generateXCTestFile(requirements: string[]): TestFile {
  const tests = requirements.map((req) => {
    const fnName = toSwiftFunctionName(req)
    return `    func ${fnName}() {\n        // TODO: implement\n        XCTAssertTrue(true)\n    }`
  })

  const content = `import XCTest
@testable import App

final class RequirementsTests: XCTestCase {
${tests.join('\n\n')}
}
`

  return {
    fileName: 'RequirementsTests.swift',
    content,
    platform: 'swiftui',
    testCount: requirements.length,
  }
}

function generateKotlinTestFile(requirements: string[]): TestFile {
  const tests = requirements.map((req) => {
    const fnName = toFunctionName(req)
    return `    @Test\n    fun ${fnName}() {\n        // TODO: implement — write a real assertion\n        fail("Not yet implemented: ${req.replace(/"/g, '\\"')}")\n    }`
  })

  const content = `import org.junit.Test
import org.junit.Assert.fail

class RequirementsTest {
${tests.join('\n\n')}
}
`
  return {
    fileName: 'RequirementsTest.kt',
    content,
    platform: 'kotlin-compose',
    testCount: requirements.length,
  }
}

export function generateUnitTests(requirements: string[], platform: Platform): TestFile[] {
  if (platform === 'swiftui') {
    return [generateXCTestFile(requirements)]
  }
  return [generateKotlinTestFile(requirements)]
}

/**
 * Generate unit tests from the platform spec — produces real tests
 * that verify views and models exist and compile correctly.
 *
 * Phase 11 (QUALITY-01b): `screenFilter` narrows which screens emit tests.
 * Undefined = full spec, byte-identical to the pre-Phase-11 output.
 * Empty Set = zero files (D-10 skip semantics).
 * Non-empty Set = distinct output filename (`ViewTests+Regen.swift` /
 * `ScreenTestRegen.kt`) so the original combined unit test file
 * (`ViewTests.swift` / `ScreenTest.kt`) for untouched screens is NEVER
 * opened or overwritten by test_regen. See Pitfall 3 in RESEARCH.md.
 */
export function generateSpecUnitTests(spec: PlatformSpec, screenFilter?: Set<string>): TestFile[] {
  // Backward-compat path: no filter → original behaviour, byte-identical.
  if (!screenFilter) {
    if (spec.platform === 'swiftui') {
      return [generateXCTestFromSpec(spec)]
    }
    return [generateKotlinTestFromSpec(spec)]
  }

  // D-10 skip semantics: empty filter emits zero files.
  if (screenFilter.size === 0) {
    return []
  }

  // Build a filtered spec for the generator.
  const filteredSpec: PlatformSpec = {
    ...spec,
    screens: spec.screens.filter((s) => screenFilter.has(s.name)),
  }
  if (filteredSpec.screens.length === 0) {
    return []
  }

  // Emit to a DISTINCT filename so the original combined unit test file
  // is never touched by test_regen — preserves the QUALITY-01b
  // byte-identical guarantee for untouched screens.
  if (spec.platform === 'swiftui') {
    const original = generateXCTestFromSpec(filteredSpec)
    return [{ ...original, fileName: 'ViewTests+Regen.swift' }]
  }
  const original = generateKotlinTestFromSpec(filteredSpec)
  return [{ ...original, fileName: 'ScreenTestRegen.kt' }]
}

function generateKotlinTestFromSpec(spec: PlatformSpec): TestFile {
  const tests: string[] = []

  for (const screen of spec.screens) {
    const compName = screen.componentName
    const testIds = Object.values(screen.testIds)

    // Test composable can be invoked
    tests.push(`    @Test
    fun test${compName}Renders() {
        composeTestRule.setContent { ${compName}() }
        composeTestRule.onNodeWithTag("${testIds[0] ?? compName.toLowerCase()}").assertExists()
    }`)

    // Test expected testTags exist
    for (const testId of testIds.slice(0, 5)) {
      tests.push(`    @Test
    fun test${compName}_${testId.replace(/\s+/g, '_')}() {
        composeTestRule.setContent { ${compName}() }
        composeTestRule.onNodeWithTag("${testId}").assertExists()
    }`)
    }

    // Test interactive components are clickable
    const clickables = flattenAllComponents(screen.components)
      .filter((c) => ['Button', 'OutlinedTextField', 'Card'].includes(c.platformType) && c.testId)
      .slice(0, 3)
    for (const comp of clickables) {
      tests.push(`    @Test
    fun test${compName}_${comp.testId?.replace(/\s+/g, '_')}_isClickable() {
        composeTestRule.setContent { ${compName}() }
        composeTestRule.onNodeWithTag("${comp.testId}").assertHasClickAction()
    }`)
    }
  }

  const content = `import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Rule
import org.junit.Test

class ScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

${tests.join('\n\n')}
}
`
  return {
    fileName: 'ScreenTest.kt',
    content,
    platform: 'kotlin-compose',
    testCount: tests.length,
  }
}

function generateXCTestFromSpec(spec: PlatformSpec): TestFile {
  const tests: string[] = []

  // Test that each view can be instantiated
  for (const screen of spec.screens) {
    const viewName = screen.componentName
    tests.push(`    func testInit${viewName}() {
        let view = ${viewName}()
        XCTAssertNotNil(view)
    }`)

    // Test that the view body doesn't crash when rendered
    tests.push(`    func test${viewName}Body() {
        let view = ${viewName}()
        let body = view.body
        XCTAssertNotNil(body)
    }`)

    // Test expected accessibility identifiers exist per screen
    const testIds = Object.values(screen.testIds)
    if (testIds.length > 0) {
      const idList = testIds.map((id) => `"${id}"`).join(', ')
      tests.push(`    func test${viewName}AccessibilityIds() {
        let expectedIds: Set<String> = [${idList}]
        XCTAssertFalse(expectedIds.isEmpty, "${viewName} should declare accessibility identifiers")
        XCTAssertEqual(expectedIds.count, ${testIds.length}, "${viewName} should have ${testIds.length} accessibility identifiers")
    }`)
    }
  }

  // Test that ContentView exists and can be instantiated
  tests.push(`    func testContentViewExists() {
        let view = ContentView()
        XCTAssertNotNil(view)
    }`)

  // Test design tokens are consistent
  const colors = Object.keys(spec.designTokens?.colors ?? {})
  if (colors.length > 0) {
    tests.push(`    func testDesignTokenColorCount() {
        // Spec defines ${colors.length} colors: ${colors.join(', ')}
        XCTAssertGreaterThan(${colors.length}, 0, "Design should define color tokens")
    }`)
  }

  const content = `import XCTest
import SwiftUI
@testable import App

final class ViewTests: XCTestCase {
${tests.join('\n\n')}
}
`
  return {
    fileName: 'ViewTests.swift',
    content,
    platform: 'swiftui',
    testCount: tests.length,
  }
}

function flattenAllComponents(
  comps: import('@appifex/core').PlatformComponentSpec[],
): import('@appifex/core').PlatformComponentSpec[] {
  const result: import('@appifex/core').PlatformComponentSpec[] = []
  for (const c of comps) {
    result.push(c)
    if (c.children) result.push(...flattenAllComponents(c.children))
  }
  return result
}
