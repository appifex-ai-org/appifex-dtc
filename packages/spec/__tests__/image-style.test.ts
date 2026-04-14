import { describe, it, expect } from 'vitest'
import { inferAppImageStyle } from '../src/translate.js'

describe('inferAppImageStyle', () => {
  it('returns .hero for fill mode with 16:9 ratio', () => {
    expect(inferAppImageStyle('fill', 1600, 900)).toBe('hero')
  })

  it('returns .card for fill mode with 4:3 ratio', () => {
    expect(inferAppImageStyle('fill', 400, 300)).toBe('card')
  })

  it('returns .grid for fill mode with 1:1 ratio', () => {
    expect(inferAppImageStyle('fill', 400, 400)).toBe('grid')
  })

  it('returns .card for fill mode without dimensions', () => {
    expect(inferAppImageStyle('fill')).toBe('card')
  })

  it('returns .detail for fit mode', () => {
    expect(inferAppImageStyle('fit')).toBe('detail')
  })

  it('returns .fullWidth for stretch mode', () => {
    expect(inferAppImageStyle('stretch')).toBe('fullWidth')
  })

  it('returns .card when no mode or dimensions', () => {
    expect(inferAppImageStyle()).toBe('card')
    expect(inferAppImageStyle(undefined, undefined, undefined)).toBe('card')
  })

  it('returns .card for unknown mode', () => {
    expect(inferAppImageStyle('unknown-mode', 100, 100)).toBe('card')
  })

  describe('translateSpec integration', () => {
    it('adds appImageStyle to SwiftUI image components', async () => {
      const { extractSpecFromPen } = await import('../src/pen-extractor.js')
      const { translateSpec } = await import('../src/translate.js')

      const penDoc = JSON.stringify({
        version: '1',
        children: [
          {
            type: 'frame',
            name: 'Home',
            width: 390,
            height: 844,
            children: [
              {
                type: 'frame',
                name: 'Hero',
                width: 390,
                height: 220,
                fills: [{ type: 'image', url: './hero.png', mode: 'fill' }],
                children: [],
              },
              { type: 'text', name: 'Title', content: 'Hello' },
            ],
          },
        ],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'swiftui')
      const comps = platform.screens[0].components

      // Image component should have appImageStyle
      expect(comps[0].props.appImageStyle).toBe('hero')
      expect(comps[0].props.imageUrl).toBe('./hero.png')
      expect(comps[0].props.imageFillMode).toBe('fill')

      // Text component should not
      expect(comps[1].props.appImageStyle).toBeUndefined()
    })

    it('does not add appImageStyle for kotlin-compose platform', async () => {
      const { extractSpecFromPen } = await import('../src/pen-extractor.js')
      const { translateSpec } = await import('../src/translate.js')

      const penDoc = JSON.stringify({
        version: '1',
        children: [
          {
            type: 'frame',
            name: 'Home',
            width: 390,
            height: 844,
            children: [
              {
                type: 'frame',
                name: 'Hero',
                fills: [{ type: 'image', url: './hero.png', mode: 'fill' }],
                children: [],
              },
            ],
          },
        ],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'kotlin-compose')

      expect(platform.screens[0].components[0].props.appImageStyle).toBeUndefined()
    })
  })
})
