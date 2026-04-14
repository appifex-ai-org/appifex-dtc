import { describe, it, expect } from 'vitest'
import { extractSpec, translateSpec } from '../src/index.js'
import type { DesignSpec, PlatformSpec } from '@appifex/core'

const sampleSpec: DesignSpec = {
  version: '1.0',
  screens: [
    {
      id: 'screen-browse',
      name: 'Browse Pets',
      description: 'Grid of adoptable pets with search',
      components: [
        {
          id: 'comp-search',
          type: 'input',
          name: 'SearchBar',
          props: { placeholder: 'Search pets...' },
          style: { height: 44, borderRadius: 22 },
        },
        {
          id: 'comp-grid',
          type: 'list',
          name: 'PetGrid',
          props: { columns: 2 },
          style: { gap: 12 },
          children: [
            {
              id: 'comp-card',
              type: 'card',
              name: 'PetCard',
              props: {},
              style: { borderRadius: 12 },
              children: [
                { id: 'comp-img', type: 'image', name: 'PetImage', props: { aspectRatio: 1 }, style: {} },
                { id: 'comp-name', type: 'text', name: 'PetName', props: {}, style: { fontSize: 16, fontWeight: 'bold' } },
              ],
            },
          ],
        },
      ],
      layout: { type: 'stack', direction: 'vertical', spacing: 16 },
    },
  ],
  designTokens: {
    colors: { primary: '#FF6B35', background: '#FFFFFF' },
    typography: { heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 'bold' } },
    spacing: { sm: 8, md: 16, lg: 24 },
    borderRadius: { sm: 8, md: 12, lg: 22 },
  },
}

describe('extractSpec', () => {
  it('parses a JSON design spec string into DesignSpec', () => {
    const json = JSON.stringify(sampleSpec)
    const result = extractSpec(json)

    expect(result.version).toBe('1.0')
    expect(result.screens).toHaveLength(1)
    expect(result.screens[0].name).toBe('Browse Pets')
    expect(result.screens[0].components).toHaveLength(2)
  })

  it('throws on invalid JSON', () => {
    expect(() => extractSpec('not json')).toThrow()
  })

  it('throws on missing required fields', () => {
    expect(() => extractSpec(JSON.stringify({ version: '1.0' }))).toThrow('screens')
  })
})

describe('translateSpec', () => {
  it('translates to swiftui platform spec with accessibilityIdentifiers', () => {
    const result = translateSpec(sampleSpec, 'swiftui')

    expect(result.platform).toBe('swiftui')
    const screen = result.screens[0]
    expect(screen.componentName).toBe('BrowsePetsView')
    // SwiftUI components mapped to SwiftUI types
    expect(screen.components[0].platformType).toMatch(/TextField|SearchField/)
  })

  it('includes design tokens in output', () => {
    const result = translateSpec(sampleSpec, 'swiftui')
    expect(result.designTokens).toEqual(sampleSpec.designTokens)
  })

  it('generates platform-appropriate imports', () => {
    const swift = translateSpec(sampleSpec, 'swiftui')
    expect(swift.imports).toEqual(expect.arrayContaining(['SwiftUI']))

    const kotlin = translateSpec(sampleSpec, 'kotlin-compose')
    expect(kotlin.imports).toEqual(expect.arrayContaining(['androidx.compose.ui']))
  })
})
