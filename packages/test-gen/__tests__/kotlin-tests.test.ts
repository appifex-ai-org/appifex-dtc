import { describe, it, expect } from 'vitest'
import { generateUnitTests, generateSpecUnitTests } from '../src/unit-tests.js'
import type { PlatformSpec } from '@appifex/core'

describe('generateUnitTests for kotlin-compose', () => {
  it('produces a Kotlin JUnit test file', () => {
    const [file] = generateUnitTests(['User can login', 'User can register'], 'kotlin-compose')

    expect(file.fileName).toBe('RequirementsTest.kt')
    expect(file.platform).toBe('kotlin-compose')
    expect(file.testCount).toBe(2)
    expect(file.content).toContain('import org.junit.Test')
    expect(file.content).toContain('@Test')
    expect(file.content).toContain('fail("Not yet implemented')
  })
})

describe('generateSpecUnitTests for kotlin-compose', () => {
  const spec: PlatformSpec = {
    platform: 'kotlin-compose',
    screens: [
      {
        id: 's1',
        name: 'Home',
        componentName: 'HomeScreen',
        description: 'Home',
        components: [
          {
            id: 'c1',
            platformType: 'Button',
            name: 'Login Button',
            props: { testID: 'login_button' },
            style: {},
            testId: 'login_button',
          },
          { id: 'c2', platformType: 'Text', name: 'Title', props: {}, style: {}, testId: 'title' },
        ],
        testIds: { c1: 'login_button', c2: 'title' },
      },
    ],
    designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
    imports: ['androidx.compose.material3'],
  }

  it('produces a Kotlin Compose test file', () => {
    const [file] = generateSpecUnitTests(spec)

    expect(file.fileName).toBe('ScreenTest.kt')
    expect(file.platform).toBe('kotlin-compose')
    expect(file.content).toContain('createComposeRule')
    expect(file.content).toContain('onNodeWithTag')
    expect(file.content).toContain('HomeScreen')
  })

  it('tests for testTag existence', () => {
    const [file] = generateSpecUnitTests(spec)

    expect(file.content).toContain('"login_button"')
    expect(file.content).toContain('"title"')
    expect(file.content).toContain('assertExists')
  })

  it('tests clickable components', () => {
    const [file] = generateSpecUnitTests(spec)

    expect(file.content).toContain('assertHasClickAction')
  })
})
