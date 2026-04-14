import { describe, it, expect } from 'vitest'
import { translateSpec, generateComposeModifiers } from '../src/translate.js'
import type { DesignSpec } from '@appifex/core'

const sampleSpec: DesignSpec = {
  version: '1.0',
  screens: [{
    id: 'screen-home',
    name: 'Home',
    description: 'Home screen',
    components: [
      { id: 'c1', type: 'text', name: 'Title Text', props: {}, style: {}, children: [] },
      { id: 'c2', type: 'button', name: 'Start Button', props: {}, style: {}, children: [] },
      { id: 'c3', type: 'input', name: 'Search Field', props: {}, style: {}, children: [] },
      { id: 'c4', type: 'list', name: 'Item List', props: {}, style: {}, children: [] },
      { id: 'c5', type: 'tab-bar', name: 'Tab Bar', props: {}, style: {}, children: [] },
      { id: 'c6', type: 'card', name: 'Info Card', props: {}, style: {}, children: [] },
    ],
    layout: { type: 'stack' },
  }],
  designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
}

describe('translateSpec for kotlin-compose', () => {
  it('maps component types to Compose equivalents', () => {
    const result = translateSpec(sampleSpec, 'kotlin-compose')

    const types = result.screens[0].components.map(c => c.platformType)
    expect(types).toEqual(['Text', 'Button', 'OutlinedTextField', 'LazyColumn', 'NavigationBar', 'Card'])
  })

  it('uses Screen suffix for component names', () => {
    const result = translateSpec(sampleSpec, 'kotlin-compose')
    expect(result.screens[0].componentName).toBe('HomeScreen')
  })

  it('generates snake_case testIds', () => {
    const result = translateSpec(sampleSpec, 'kotlin-compose')
    const testIds = Object.values(result.screens[0].testIds)
    expect(testIds).toContain('title_text')
    expect(testIds).toContain('start_button')
    expect(testIds).toContain('search_field')
  })

  it('includes Compose imports', () => {
    const result = translateSpec(sampleSpec, 'kotlin-compose')
    expect(result.imports).toContain('androidx.compose.material3')
    expect(result.imports).toContain('androidx.navigation.compose')
  })

  it('attaches composeModifiers when style has properties', () => {
    const specWithStyle: DesignSpec = {
      ...sampleSpec,
      screens: [{
        ...sampleSpec.screens[0],
        components: [{
          id: 'c1', type: 'view', name: 'Box', props: {},
          style: { padding: { top: 16, right: 16, bottom: 16, left: 16 }, width: 'fill_container', backgroundColor: '#FF5722' },
          children: [],
        }],
      }],
    }
    const result = translateSpec(specWithStyle, 'kotlin-compose')
    const mods = result.screens[0].components[0].props.composeModifiers as string[]
    expect(mods).toBeDefined()
    expect(mods.some(m => m.includes('padding'))).toBe(true)
    expect(mods.some(m => m.includes('fillMaxWidth'))).toBe(true)
    expect(mods.some(m => m.includes('background'))).toBe(true)
  })
})

describe('generateComposeModifiers', () => {
  it('generates padding modifier', () => {
    const mods = generateComposeModifiers({ padding: { top: 8, right: 8, bottom: 8, left: 8 } })
    expect(mods).toContain('.padding(8.dp)')
  })

  it('generates fill width modifier', () => {
    const mods = generateComposeModifiers({ width: 'fill_container' })
    expect(mods).toContain('.fillMaxWidth()')
  })

  it('generates fixed width modifier', () => {
    const mods = generateComposeModifiers({ width: 200 })
    expect(mods).toContain('.width(200.dp)')
  })

  it('generates background modifier', () => {
    const mods = generateComposeModifiers({ backgroundColor: '#FF5722' })
    expect(mods[0]).toContain('.background')
    expect(mods[0]).toContain('FF5722')
  })

  it('generates clip modifier for border radius', () => {
    const mods = generateComposeModifiers({ borderRadius: 12 })
    expect(mods).toContain('.clip(RoundedCornerShape(12.dp))')
  })

  it('generates alpha modifier for opacity', () => {
    const mods = generateComposeModifiers({ opacity: 0.5 })
    expect(mods).toContain('.alpha(0.5f)')
  })

  it('generates shadow modifier', () => {
    const mods = generateComposeModifiers({ shadow: { color: '#000', offsetX: 0, offsetY: 2, blur: 4 } })
    expect(mods[0]).toContain('.shadow')
    expect(mods[0]).toContain('4.dp')
  })
})
