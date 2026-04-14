import { describe, it, expect } from 'vitest'
import { generateUITests, generateUnitTests } from '../src/index.js'
import type { PlatformSpec, MaestroFlow, TestFile } from '@appifex/core'

const sampleSpec: PlatformSpec = {
  platform: 'swiftui',
  screens: [
    {
      id: 'screen-browse',
      name: 'Browse Pets',
      componentName: 'BrowsePetsView',
      description: 'Grid of adoptable pets with search',
      components: [
        { id: 'c1', platformType: 'TextField', name: 'SearchBar', props: { accessibilityIdentifier: 'searchBar' }, style: {}, testId: 'searchBar' },
        { id: 'c2', platformType: 'LazyVGrid', name: 'PetGrid', props: { accessibilityIdentifier: 'petGrid' }, style: {}, testId: 'petGrid' },
      ],
      testIds: { c1: 'searchBar', c2: 'petGrid' },
    },
    {
      id: 'screen-detail',
      name: 'Pet Detail',
      componentName: 'PetDetailView',
      description: 'Shows pet details with adopt button',
      components: [
        { id: 'c3', platformType: 'AsyncImage', name: 'PetImage', props: { accessibilityIdentifier: 'petImage' }, style: {}, testId: 'petImage' },
        { id: 'c4', platformType: 'Button', name: 'AdoptButton', props: { accessibilityIdentifier: 'adoptButton' }, style: {}, testId: 'adoptButton' },
      ],
      testIds: { c3: 'petImage', c4: 'adoptButton' },
    },
  ],
  designTokens: {
    colors: { primary: '#FF6B35' },
    typography: {},
    spacing: {},
    borderRadius: {},
  },
  imports: ['SwiftUI'],
}

describe('generateUITests', () => {
  it('generates one Maestro flow per screen', () => {
    const flows = generateUITests(sampleSpec)

    expect(flows).toHaveLength(2)
    expect(flows[0].screenId).toBe('screen-browse')
    expect(flows[1].screenId).toBe('screen-detail')
  })

  it('produces valid YAML content', () => {
    const flows = generateUITests(sampleSpec)

    for (const flow of flows) {
      expect(flow.content).toContain('appId:')
      expect(flow.content).toContain('---')
    }
  })

  it('includes assertions for all testIDs in each screen', () => {
    const flows = generateUITests(sampleSpec)

    // Browse screen should assert searchBar and petGrid visibility
    expect(flows[0].content).toContain('searchBar')
    expect(flows[0].content).toContain('petGrid')
  })

  it('generates .yaml file names based on screen name', () => {
    const flows = generateUITests(sampleSpec)

    expect(flows[0].fileName).toBe('browse-pets.yaml')
    expect(flows[1].fileName).toBe('pet-detail.yaml')
  })

  it('includes tap assertions for button components', () => {
    const flows = generateUITests(sampleSpec)
    const detailFlow = flows[1]

    // AdoptButton is a TouchableOpacity — should have tap action
    expect(detailFlow.content).toContain('adoptButton')
    expect(detailFlow.content).toMatch(/tapOn/)
  })

  it('includes assertScreenshot when designScreenshots are provided', () => {
    const flows = generateUITests(sampleSpec, {
      bundleId: 'com.dtc.App',
      designScreenshots: {
        'screen-browse': 'designs/browse.png',
        'screen-detail': 'designs/detail.png',
      },
    })

    expect(flows[0].content).toContain('assertScreenshot')
    expect(flows[0].content).toContain('designs/browse.png')
    expect(flows[0].content).toContain('thresholdPercentage')
    expect(flows[1].content).toContain('designs/detail.png')
  })

  it('uses default 80 threshold for full-screen screenshot comparison', () => {
    const flows = generateUITests(sampleSpec, {
      designScreenshots: { 'screen-browse': 'designs/browse.png' },
    })

    expect(flows[0].content).toContain('thresholdPercentage: 80')
  })

  it('allows custom screenshot threshold', () => {
    const flows = generateUITests(sampleSpec, {
      designScreenshots: { 'screen-browse': 'designs/browse.png' },
      screenshotThreshold: 85,
    })

    expect(flows[0].content).toContain('thresholdPercentage: 85')
  })

  it('skips assertScreenshot for screens without a design image', () => {
    const flows = generateUITests(sampleSpec, {
      designScreenshots: { 'screen-browse': 'designs/browse.png' },
      // screen-detail has no screenshot
    })

    expect(flows[0].content).toContain('assertScreenshot')
    expect(flows[1].content).not.toContain('assertScreenshot')
  })
})

describe('generateUnitTests', () => {
  it('generates XCTest files for swiftui', () => {
    const requirements = [
      'Filter pets by type (dog, cat, bird)',
      'Add and remove favorites',
      'Validate adoption form requires name and email',
    ]

    const files = generateUnitTests(requirements, 'swiftui')

    expect(files.length).toBeGreaterThanOrEqual(1)
    for (const file of files) {
      expect(file.platform).toBe('swiftui')
      expect(file.fileName).toMatch(/Tests?\.swift$/)
      expect(file.content).toContain('XCTest')
      expect(file.content).toContain('func test')
      expect(file.testCount).toBeGreaterThan(0)
    }
  })

  it('generates XCTest files for swiftui with single requirement', () => {
    const requirements = ['Filter pets by type']

    const files = generateUnitTests(requirements, 'swiftui')

    expect(files.length).toBeGreaterThanOrEqual(1)
    for (const file of files) {
      expect(file.platform).toBe('swiftui')
      expect(file.fileName).toMatch(/Tests?\.swift$/)
      expect(file.content).toContain('XCTest')
      expect(file.content).toContain('func test')
    }
  })

  it('generates one test per requirement', () => {
    const requirements = ['Req A', 'Req B', 'Req C']
    const files = generateUnitTests(requirements, 'swiftui')

    const totalTests = files.reduce((sum, f) => sum + f.testCount, 0)
    expect(totalTests).toBeGreaterThanOrEqual(requirements.length)
  })
})
