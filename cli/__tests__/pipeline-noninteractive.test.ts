import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isInteractive } from '../src/pipeline.js'

describe('isInteractive', () => {
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY
  })

  afterEach(() => {
    if (originalIsTTY === undefined) {
      // Remove the property to restore undefined state
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    } else {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('returns false when opts.interactive is false', () => {
    expect(isInteractive({ interactive: false })).toBe(false)
  })

  it('returns true when opts.interactive is true', () => {
    expect(isInteractive({ interactive: true })).toBe(true)
  })

  it('returns false when opts.interactive is undefined and stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    expect(isInteractive({})).toBe(false)
  })

  it('returns true when opts.interactive is undefined and stdin is a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    expect(isInteractive({})).toBe(true)
  })

  it('explicit interactive: false overrides process.stdin.isTTY = true (MCP scenario)', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    expect(isInteractive({ interactive: false })).toBe(false)
  })

  it('explicit interactive: true overrides process.stdin.isTTY = undefined (forced interactive)', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    expect(isInteractive({ interactive: true })).toBe(true)
  })
})
