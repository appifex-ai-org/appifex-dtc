import { describe, it, expect } from 'vitest'
import { extractSpecFromMcp } from '../src/mcp-extractor.js'

describe('extractSpecFromMcp', () => {
  it('extracts spec from array of frame nodes', () => {
    const batchGetResult = [
      {
        type: 'frame',
        name: 'Home',
        width: 390,
        height: 844,
        layout: 'vertical',
        gap: 16,
        children: [
          { type: 'text', name: 'Title', content: 'Welcome' },
          { type: 'frame', name: 'Button', children: [], layout: 'horizontal', padding: 12 },
        ],
      },
    ]
    const variables = {
      'color.primary': { type: 'color', value: '#0A84FF' },
    }

    const spec = extractSpecFromMcp(batchGetResult, variables)

    expect(spec.screens).toHaveLength(1)
    expect(spec.screens[0].name).toBe('Home')
    expect(spec.screens[0].layout.direction).toBe('vertical')
    expect(spec.screens[0].layout.spacing).toBe(16)
    expect(spec.screens[0].components).toHaveLength(2)
    expect(spec.designTokens.colors.colorPrimary).toBe('#0A84FF')
  })

  it('extracts spec from document-like structure with children', () => {
    const batchGetResult = {
      version: '2.9',
      children: [
        {
          type: 'frame',
          name: 'Settings',
          width: 390,
          height: 844,
          children: [
            {
              type: 'icon_font',
              name: 'Gear',
              iconFontFamily: 'lucide',
              iconFontName: 'settings',
            },
          ],
        },
      ],
    }
    const variables = {}

    const spec = extractSpecFromMcp(batchGetResult, variables)

    expect(spec.screens).toHaveLength(1)
    expect(spec.screens[0].name).toBe('Settings')
    const icon = spec.screens[0].components[0]
    expect(icon.type).toBe('icon')
    expect(icon.props.iconFontFamily).toBe('lucide')
    expect(icon.props.iconFontName).toBe('settings')
  })

  it('wraps a single node as sole child', () => {
    const batchGetResult = {
      type: 'frame',
      name: 'Single Screen',
      width: 390,
      height: 844,
      children: [{ type: 'text', name: 'Label', content: 'Hello' }],
    }
    const variables = {}

    const spec = extractSpecFromMcp(batchGetResult, variables)

    expect(spec.screens).toHaveLength(1)
    expect(spec.screens[0].name).toBe('Single Screen')
  })

  it('passes variables through to design tokens', () => {
    const batchGetResult = [
      {
        type: 'frame',
        name: 'App',
        width: 390,
        height: 844,
        children: [{ type: 'text', name: 'Hi', content: 'Hi' }],
      },
    ]
    const variables = {
      'color.accent': { type: 'color', value: '#FF6B35' },
      'spacing.sm': { type: 'number', value: 4 },
      'radius.card': { type: 'number', value: 12 },
    }

    const spec = extractSpecFromMcp(batchGetResult, variables)

    expect(spec.designTokens.colors.colorAccent).toBe('#FF6B35')
    expect(spec.designTokens.spacing.spacingSm).toBe(4)
    expect(spec.designTokens.borderRadius.radiusCard).toBe(12)
  })

  it('extracts layout properties from MCP nodes', () => {
    const batchGetResult = [
      {
        type: 'frame',
        name: 'Card',
        width: 390,
        height: 844,
        children: [
          {
            type: 'frame',
            name: 'Row',
            layout: 'horizontal',
            gap: 8,
            padding: [12, 16],
            justifyContent: 'space_between',
            alignItems: 'center',
            children: [{ type: 'text', name: 'Label', content: 'Item' }],
          },
        ],
      },
    ]

    const spec = extractSpecFromMcp(batchGetResult, {})

    const row = spec.screens[0].components[0]
    expect(row.style.flexDirection).toBe('row')
    expect(row.style.gap).toBe(8)
    expect(row.style.padding).toEqual({ top: 12, right: 16, bottom: 12, left: 16 })
    expect(row.style.justifyContent).toBe('space_between')
    expect(row.style.alignItems).toBe('center')
  })
})
