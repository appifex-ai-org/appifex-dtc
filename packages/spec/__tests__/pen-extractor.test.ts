import { describe, it, expect } from 'vitest'
import { extractSpecFromPen } from '../src/pen-extractor.js'

function makePenDoc(children: unknown[], variables?: Record<string, unknown>): string {
  return JSON.stringify({ version: '1', children, variables })
}

function makeFrame(
  name: string,
  overrides: Record<string, unknown> = {},
  children: unknown[] = [],
): unknown {
  return { type: 'frame', name, width: 390, height: 844, ...overrides, children }
}

function makeNode(type: string, name: string, overrides: Record<string, unknown> = {}): unknown {
  return { type, name, ...overrides }
}

describe('extractSpecFromPen', () => {
  describe('layout extraction', () => {
    it('extracts horizontal layout as flexDirection row', () => {
      const doc = makePenDoc([
        makeFrame('Home', { layout: 'horizontal', gap: 8 }, [
          makeNode('text', 'Label', { content: 'Hello' }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const comp = spec.screens[0].components[0]
      expect(comp.style.flexDirection).toBeUndefined() // text node doesn't have layout
    })

    it('extracts vertical layout on container nodes', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Card', {
            layout: 'vertical',
            gap: 12,
            children: [makeNode('text', 'Title', { content: 'Card Title' })],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const card = spec.screens[0].components[0]
      expect(card.style.flexDirection).toBe('column')
      expect(card.style.gap).toBe(12)
    })

    it('extracts horizontal layout on container nodes', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Row', {
            layout: 'horizontal',
            gap: 16,
            children: [
              makeNode('text', 'A', { content: 'A' }),
              makeNode('text', 'B', { content: 'B' }),
            ],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const row = spec.screens[0].components[0]
      expect(row.style.flexDirection).toBe('row')
      expect(row.style.gap).toBe(16)
    })

    it('extracts gap from frame', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'List', { gap: 24, children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.gap).toBe(24)
    })

    it('extracts justifyContent and alignItems', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Centered', {
            layout: 'vertical',
            justifyContent: 'center',
            alignItems: 'center',
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const comp = spec.screens[0].components[0]
      expect(comp.style.justifyContent).toBe('center')
      expect(comp.style.alignItems).toBe('center')
    })

    it('extracts screen-level layout from frame', () => {
      const doc = makePenDoc([
        makeFrame('Dashboard', { layout: 'horizontal', gap: 20 }, [
          makeNode('text', 'Sidebar', { content: 'Sidebar' }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].layout.direction).toBe('horizontal')
      expect(spec.screens[0].layout.spacing).toBe(20)
    })

    it('defaults screen layout to vertical when not specified', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('text', 'Title', { content: 'Hi' })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].layout.direction).toBe('vertical')
      expect(spec.screens[0].layout.type).toBe('stack')
    })

    it('uses absolute layout type when frame layout is none', () => {
      const doc = makePenDoc([
        makeFrame('Overlay', { layout: 'none' }, [makeNode('text', 'Float', { content: 'Float' })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].layout.type).toBe('absolute')
    })
  })

  describe('padding extraction', () => {
    it('extracts uniform padding', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'Padded', { padding: 16, children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.padding).toEqual({
        top: 16,
        right: 16,
        bottom: 16,
        left: 16,
      })
    })

    it('extracts [vertical, horizontal] padding', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'Padded', { padding: [12, 24], children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.padding).toEqual({
        top: 12,
        right: 24,
        bottom: 12,
        left: 24,
      })
    })

    it('extracts [top, right, bottom, left] padding', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Padded', { padding: [16, 24, 16, 24], children: [] }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.padding).toEqual({
        top: 16,
        right: 24,
        bottom: 16,
        left: 24,
      })
    })
  })

  describe('opacity extraction', () => {
    it('extracts opacity less than 1', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'Faded', { opacity: 0.5, children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.opacity).toBe(0.5)
    })

    it('does not set opacity when it is 1', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'Full', { opacity: 1, children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.opacity).toBeUndefined()
    })
  })

  describe('shadow extraction', () => {
    it('extracts drop shadow from effects', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Card', {
            effects: [
              {
                type: 'drop_shadow',
                color: '#00000033',
                offsetX: 0,
                offsetY: 4,
                blur: 12,
                spread: 0,
              },
            ],
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const shadow = spec.screens[0].components[0].style.shadow as Record<string, unknown>
      expect(shadow).toBeDefined()
      expect(shadow.color).toBe('#00000033')
      expect(shadow.offsetX).toBe(0)
      expect(shadow.offsetY).toBe(4)
      expect(shadow.blur).toBe(12)
    })
  })

  describe('stroke extraction', () => {
    it('extracts stroke as borderWidth and borderColor', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Bordered', {
            stroke: { color: '#CCCCCC', width: 1 },
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const style = spec.screens[0].components[0].style
      expect(style.borderWidth).toBe(1)
      expect(style.borderColor).toBe('#CCCCCC')
    })

    it('ignores zero-width strokes', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'NoBorder', {
            stroke: { color: '#000', width: 0 },
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.borderWidth).toBeUndefined()
    })
  })

  describe('icon identity extraction', () => {
    it('extracts iconFontFamily and iconFontName', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('icon_font', 'Home Icon', {
            iconFontFamily: 'lucide',
            iconFontName: 'home',
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const icon = spec.screens[0].components[0]
      expect(icon.type).toBe('icon')
      expect(icon.props.iconFontFamily).toBe('lucide')
      expect(icon.props.iconFontName).toBe('home')
    })
  })

  describe('image fill extraction', () => {
    it('extracts image url and fill mode from fills', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Hero', {
            fills: [{ type: 'image', url: './hero.png', mode: 'fill' }],
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const comp = spec.screens[0].components[0]
      expect(comp.props.imageUrl).toBe('./hero.png')
      expect(comp.props.imageFillMode).toBe('fill')
    })

    it('ignores non-image fills', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Colored', {
            fills: [{ type: 'solid', color: '#FF0000' }],
            children: [],
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].props.imageUrl).toBeUndefined()
    })
  })

  describe('typography extraction', () => {
    it('extracts fontFamily, letterSpacing, lineHeight, textAlign', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('text', 'Title', {
            content: 'Hello World',
            fontSize: 24,
            fontWeight: 'bold',
            fontFamily: 'Inter',
            letterSpacing: 0.5,
            lineHeight: 32,
            textAlign: 'center',
          }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      const style = spec.screens[0].components[0].style
      expect(style.fontFamily).toBe('Inter')
      expect(style.letterSpacing).toBe(0.5)
      expect(style.lineHeight).toBe(32)
      expect(style.textAlign).toBe('center')
    })
  })

  describe('design tokens from variables', () => {
    it('extracts spacing variables instead of hardcoded fallbacks', () => {
      const doc = makePenDoc([makeFrame('Home', {}, [makeNode('text', 'Hi', { content: 'Hi' })])], {
        'color.primary': { type: 'color', value: '#0A84FF' },
        'spacing.sm': { type: 'number', value: 4 },
        'spacing.md': { type: 'number', value: 12 },
        'spacing.lg': { type: 'number', value: 32 },
        'radius.card': { type: 'number', value: 16 },
      })
      const spec = extractSpecFromPen(doc)
      expect(spec.designTokens.colors.colorPrimary).toBe('#0A84FF')
      expect(spec.designTokens.spacing.spacingSm).toBe(4)
      expect(spec.designTokens.spacing.spacingMd).toBe(12)
      expect(spec.designTokens.spacing.spacingLg).toBe(32)
      expect(spec.designTokens.borderRadius.radiusCard).toBe(16)
    })

    it('uses fallback spacing when no spacing variables exist', () => {
      const doc = makePenDoc([makeFrame('Home', {}, [makeNode('text', 'Hi', { content: 'Hi' })])], {
        'color.bg': { type: 'color', value: '#FFFFFF' },
      })
      const spec = extractSpecFromPen(doc)
      expect(spec.designTokens.spacing).toEqual({ sm: 8, md: 16, lg: 24 })
      expect(spec.designTokens.borderRadius).toEqual({ sm: 8, md: 12, lg: 16 })
    })
  })

  describe('corner radius', () => {
    it('extracts uniform corner radius', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [makeNode('frame', 'Rounded', { cornerRadius: 12, children: [] })]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.borderRadius).toBe(12)
    })

    it('extracts first value from per-corner radius array', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'TopRounded', { cornerRadius: [16, 16, 0, 0], children: [] }),
        ]),
      ])
      const spec = extractSpecFromPen(doc)
      expect(spec.screens[0].components[0].style.borderRadius).toBe(16)
    })
  })

  describe('non-string fill robustness (regression for Phase 17 / smoke fail)', () => {
    it('does not throw when node.fill is an object (gradient)', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'GradientCard', {
            fill: {
              type: 'gradient',
              stops: [
                { color: '#ff3366', offset: 0 },
                { color: '#ffaa00', offset: 1 },
              ],
            } as unknown as string,
            children: [],
          }),
        ]),
      ])
      expect(() => extractSpecFromPen(doc)).not.toThrow()
    })

    it('does not throw when fills[0].color is an object', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'GradientFill', {
            fills: [
              {
                type: 'gradient',
                color: { stops: [{ color: '#ff3366', offset: 0 }] } as unknown as string,
              },
            ],
            children: [],
          }),
        ]),
      ])
      expect(() => extractSpecFromPen(doc)).not.toThrow()
    })

    it('does not throw when a $variable reference resolves to an object value', () => {
      const doc = makePenDoc(
        [
          makeFrame('Home', {}, [
            makeNode('frame', 'VarRefBg', { fill: '$primary', children: [] }),
          ]),
        ],
        {
          primary: {
            type: 'gradient',
            value: { stops: [{ color: '#ff3366', offset: 0 }] } as unknown as string,
          },
        },
      )
      expect(() => extractSpecFromPen(doc)).not.toThrow()
    })

    it('does not throw on image fills with no color field', () => {
      const doc = makePenDoc([
        makeFrame('Home', {}, [
          makeNode('frame', 'Hero', {
            fills: [{ type: 'image', url: './hero.png', mode: 'fill' }],
            children: [],
          }),
        ]),
      ])
      expect(() => extractSpecFromPen(doc)).not.toThrow()
    })

    it('returns a non-null designTokens after parsing a doc with mixed non-string fills', () => {
      const doc = makePenDoc(
        [
          makeFrame('Home', {}, [
            makeNode('frame', 'Mixed', {
              fill: { type: 'gradient', stops: [] } as unknown as string,
              children: [],
            }),
          ]),
        ],
        { brand: { type: 'color', value: '#ff3366' } },
      )
      const spec = extractSpecFromPen(doc)
      expect(spec.designTokens).toBeDefined()
      expect(spec.designTokens.colors).toBeDefined()
      expect(spec.designTokens.colors.brand).toBe('#ff3366')
    })
  })
})
