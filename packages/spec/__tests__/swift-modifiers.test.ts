import { describe, it, expect } from 'vitest'
import { generateSwiftModifiers } from '../src/translate.js'

describe('generateSwiftModifiers', () => {
  describe('padding', () => {
    it('generates uniform padding', () => {
      const mods = generateSwiftModifiers({
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      })
      expect(mods).toEqual(['.padding(16)'])
    })

    it('generates vertical + horizontal padding', () => {
      const mods = generateSwiftModifiers({
        padding: { top: 12, right: 24, bottom: 12, left: 24 },
      })
      expect(mods).toEqual(['.padding(.vertical, 12)', '.padding(.horizontal, 24)'])
    })

    it('generates per-edge padding', () => {
      const mods = generateSwiftModifiers({
        padding: { top: 0, right: 20, bottom: 24, left: 20 },
      })
      expect(mods).toContain('.padding(.bottom, 24)')
      expect(mods).toContain('.padding(.leading, 20)')
      expect(mods).toContain('.padding(.trailing, 20)')
      // top is 0, should be omitted
      expect(mods.find(m => m.includes('.top'))).toBeUndefined()
    })
  })

  describe('frame sizing', () => {
    it('generates fill_container as maxWidth infinity', () => {
      const mods = generateSwiftModifiers({ width: 'fill_container' })
      expect(mods).toContain('.frame(maxWidth: .infinity)')
    })

    it('generates numeric width', () => {
      const mods = generateSwiftModifiers({ width: 200 })
      expect(mods).toContain('.frame(width: 200)')
    })

    it('generates fill_container height', () => {
      const mods = generateSwiftModifiers({ height: 'fill_container' })
      expect(mods).toContain('.frame(maxHeight: .infinity)')
    })

    it('generates numeric height', () => {
      const mods = generateSwiftModifiers({ height: 44 })
      expect(mods).toContain('.frame(height: 44)')
    })
  })

  describe('background', () => {
    it('generates background color', () => {
      const mods = generateSwiftModifiers({ backgroundColor: '#FF6B35' })
      expect(mods).toContain('.background(Color("#FF6B35"))')
    })
  })

  describe('corner radius', () => {
    it('generates clipShape with corner radius', () => {
      const mods = generateSwiftModifiers({ borderRadius: 12 })
      expect(mods).toEqual(['.clipShape(.rect(cornerRadius: 12))'])
    })
  })

  describe('border', () => {
    it('generates overlay with stroke', () => {
      const mods = generateSwiftModifiers({
        borderWidth: 1,
        borderColor: '#CCC',
        borderRadius: 8,
      })
      expect(mods).toHaveLength(2) // clipShape + overlay
      expect(mods[1]).toContain('RoundedRectangle')
      expect(mods[1]).toContain('lineWidth: 1')
    })
  })

  describe('shadow', () => {
    it('generates shadow modifier', () => {
      const mods = generateSwiftModifiers({
        shadow: { color: '#000000', offsetX: 0, offsetY: 4, blur: 8 },
      })
      expect(mods).toHaveLength(1)
      expect(mods[0]).toContain('.shadow(')
      expect(mods[0]).toContain('radius: 8')
      expect(mods[0]).toContain('y: 4')
    })
  })

  describe('opacity', () => {
    it('generates opacity modifier', () => {
      const mods = generateSwiftModifiers({ opacity: 0.5 })
      expect(mods).toEqual(['.opacity(0.5)'])
    })

    it('does not generate opacity for 1.0', () => {
      const mods = generateSwiftModifiers({ opacity: 1 })
      expect(mods).toEqual([])
    })
  })

  describe('empty style', () => {
    it('returns empty array for no style properties', () => {
      const mods = generateSwiftModifiers({})
      expect(mods).toEqual([])
    })
  })

  describe('combined modifiers', () => {
    it('generates multiple modifiers for rich style', () => {
      const mods = generateSwiftModifiers({
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        width: 'fill_container',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        shadow: { color: '#000', offsetX: 0, offsetY: 2, blur: 6 },
      })
      expect(mods.length).toBeGreaterThanOrEqual(4)
      expect(mods).toContain('.padding(16)')
      expect(mods).toContain('.frame(maxWidth: .infinity)')
      expect(mods).toContain('.clipShape(.rect(cornerRadius: 12))')
    })
  })

  describe('translateSpec integration', () => {
    it('includes swiftModifiers in SwiftUI component props', async () => {
      const { extractSpecFromPen } = await import('../src/pen-extractor.js')
      const { translateSpec } = await import('../src/translate.js')

      const penDoc = JSON.stringify({
        version: '1',
        children: [{
          type: 'frame', name: 'Home', width: 390, height: 844,
          children: [{
            type: 'frame', name: 'Card',
            padding: [20, 20, 20, 20],
            cornerRadius: 12,
            fills: [{ color: '#F4F4F5' }],
            children: [{ type: 'text', name: 'Title', content: 'Hello' }],
          }],
        }],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'swiftui')
      const card = platform.screens[0].components[0]

      expect(card.props.swiftModifiers).toBeDefined()
      const mods = card.props.swiftModifiers as string[]
      expect(mods).toContain('.padding(20)')
      expect(mods).toContain('.clipShape(.rect(cornerRadius: 12))')
    })

    it('does not include swiftModifiers for kotlin-compose', async () => {
      const { extractSpecFromPen } = await import('../src/pen-extractor.js')
      const { translateSpec } = await import('../src/translate.js')

      const penDoc = JSON.stringify({
        version: '1',
        children: [{
          type: 'frame', name: 'Home', width: 390, height: 844,
          children: [{
            type: 'frame', name: 'Card', padding: 16, cornerRadius: 12,
            children: [{ type: 'text', name: 'Title', content: 'Hello' }],
          }],
        }],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'kotlin-compose')
      const card = platform.screens[0].components[0]

      expect(card.props.swiftModifiers).toBeUndefined()
    })
  })
})
