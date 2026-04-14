import { describe, it, expect } from 'vitest'
import { toSfSymbol, ICON_TO_SF_SYMBOL } from '../src/icon-mapping.js'

describe('toSfSymbol', () => {
  describe('lucide icons', () => {
    it('maps home to house.fill', () => {
      expect(toSfSymbol('lucide', 'home')).toBe('house.fill')
    })

    it('maps search to magnifyingglass', () => {
      expect(toSfSymbol('lucide', 'search')).toBe('magnifyingglass')
    })

    it('maps heart to heart.fill', () => {
      expect(toSfSymbol('lucide', 'heart')).toBe('heart.fill')
    })

    it('maps shopping-cart to cart.fill', () => {
      expect(toSfSymbol('lucide', 'shopping-cart')).toBe('cart.fill')
    })

    it('maps chevron-right to chevron.forward', () => {
      expect(toSfSymbol('lucide', 'chevron-right')).toBe('chevron.forward')
    })

    it('maps chevron-left to chevron.backward', () => {
      expect(toSfSymbol('lucide', 'chevron-left')).toBe('chevron.backward')
    })

    it('maps plus to plus', () => {
      expect(toSfSymbol('lucide', 'plus')).toBe('plus')
    })

    it('maps check to checkmark', () => {
      expect(toSfSymbol('lucide', 'check')).toBe('checkmark')
    })

    it('maps circle-check to checkmark.circle.fill', () => {
      expect(toSfSymbol('lucide', 'circle-check')).toBe('checkmark.circle.fill')
    })

    it('maps book-open to book.fill', () => {
      expect(toSfSymbol('lucide', 'book-open')).toBe('book.fill')
    })

    it('maps clock-3 to clock.fill', () => {
      expect(toSfSymbol('lucide', 'clock-3')).toBe('clock.fill')
    })

    it('maps users to person.2.fill', () => {
      expect(toSfSymbol('lucide', 'users')).toBe('person.2.fill')
    })

    it('maps store to storefront.fill', () => {
      expect(toSfSymbol('lucide', 'store')).toBe('storefront.fill')
    })

    it('maps package to shippingbox.fill', () => {
      expect(toSfSymbol('lucide', 'package')).toBe('shippingbox.fill')
    })

    it('maps list to list.bullet', () => {
      expect(toSfSymbol('lucide', 'list')).toBe('list.bullet')
    })

    it('maps ellipsis to ellipsis', () => {
      expect(toSfSymbol('lucide', 'ellipsis')).toBe('ellipsis')
    })

    it('maps share to square.and.arrow.up', () => {
      expect(toSfSymbol('lucide', 'share')).toBe('square.and.arrow.up')
    })
  })

  describe('Material Symbols', () => {
    it('maps Outlined search to magnifyingglass', () => {
      expect(toSfSymbol('Material Symbols Outlined', 'search')).toBe('magnifyingglass')
    })

    it('maps Outlined home to house.fill', () => {
      expect(toSfSymbol('Material Symbols Outlined', 'home')).toBe('house.fill')
    })

    it('maps Outlined delete to trash.fill', () => {
      expect(toSfSymbol('Material Symbols Outlined', 'delete')).toBe('trash.fill')
    })

    it('maps Rounded (alias) to same as Outlined', () => {
      expect(toSfSymbol('Material Symbols Rounded', 'settings')).toBe('gearshape.fill')
    })

    it('maps Sharp (alias) to same as Outlined', () => {
      expect(toSfSymbol('Material Symbols Sharp', 'favorite')).toBe('heart.fill')
    })
  })

  describe('feather icons (alias to lucide)', () => {
    it('maps heart to heart.fill', () => {
      expect(toSfSymbol('feather', 'heart')).toBe('heart.fill')
    })

    it('maps search to magnifyingglass', () => {
      expect(toSfSymbol('feather', 'search')).toBe('magnifyingglass')
    })
  })

  describe('phosphor icons', () => {
    it('maps house to house.fill', () => {
      expect(toSfSymbol('phosphor', 'house')).toBe('house.fill')
    })

    it('maps trash to trash.fill', () => {
      expect(toSfSymbol('phosphor', 'trash')).toBe('trash.fill')
    })

    it('maps magnifying-glass to magnifyingglass', () => {
      expect(toSfSymbol('phosphor', 'magnifying-glass')).toBe('magnifyingglass')
    })

    it('maps caret-right to chevron.forward', () => {
      expect(toSfSymbol('phosphor', 'caret-right')).toBe('chevron.forward')
    })
  })

  describe('fallback behavior', () => {
    it('returns icon name as-is for unknown icons', () => {
      expect(toSfSymbol('lucide', 'unknown-icon-xyz')).toBe('unknown-icon-xyz')
    })

    it('returns icon name for unknown families', () => {
      expect(toSfSymbol('unknown-family', 'home')).toBe('home')
    })
  })

  describe('translateSpec integration', () => {
    it('adds sfSymbolName to SwiftUI icon components', async () => {
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
                type: 'icon_font',
                name: 'Nav Icon',
                iconFontFamily: 'lucide',
                iconFontName: 'home',
              },
              {
                type: 'icon_font',
                name: 'Search',
                iconFontFamily: 'lucide',
                iconFontName: 'search',
              },
              { type: 'text', name: 'Title', content: 'Hello' },
            ],
          },
        ],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'swiftui')
      const comps = platform.screens[0].components

      // Icon components should have sfSymbolName
      expect(comps[0].props.sfSymbolName).toBe('house.fill')
      expect(comps[1].props.sfSymbolName).toBe('magnifyingglass')
      // Text component should NOT have sfSymbolName
      expect(comps[2].props.sfSymbolName).toBeUndefined()
    })

    it('does not add sfSymbolName for kotlin-compose platform', async () => {
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
              { type: 'icon_font', name: 'Icon', iconFontFamily: 'lucide', iconFontName: 'home' },
            ],
          },
        ],
      })

      const spec = extractSpecFromPen(penDoc)
      const platform = translateSpec(spec, 'kotlin-compose')

      expect(platform.screens[0].components[0].props.sfSymbolName).toBeUndefined()
    })
  })
})
