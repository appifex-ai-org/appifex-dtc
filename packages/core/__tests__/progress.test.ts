import { describe, it, expect, vi } from 'vitest'
import { ProgressEmitter } from '../src/progress.js'
import type { ProgressEvent } from '../src/types.js'

describe('ProgressEmitter', () => {
  it('emits events to subscribed listeners', () => {
    const emitter = new ProgressEmitter()
    const listener = vi.fn()

    emitter.on(listener)
    const event: ProgressEvent = {
      phase: 'design',
      status: 'started',
      message: 'Creating design',
      timestamp: Date.now(),
    }
    emitter.emit(event)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event)
  })

  it('supports multiple listeners', () => {
    const emitter = new ProgressEmitter()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    emitter.on(listener1)
    emitter.on(listener2)
    emitter.emit({ phase: 'build', status: 'running', message: 'Building', timestamp: 1 })

    expect(listener1).toHaveBeenCalledOnce()
    expect(listener2).toHaveBeenCalledOnce()
  })

  it('off() removes a listener', () => {
    const emitter = new ProgressEmitter()
    const listener = vi.fn()

    emitter.on(listener)
    emitter.off(listener)
    emitter.emit({ phase: 'build', status: 'completed', message: 'Done', timestamp: 1 })

    expect(listener).not.toHaveBeenCalled()
  })

  it('records event history', () => {
    const emitter = new ProgressEmitter()

    emitter.emit({ phase: 'design', status: 'started', message: 'Start', timestamp: 1 })
    emitter.emit({ phase: 'design', status: 'completed', message: 'Done', timestamp: 2 })

    expect(emitter.history).toHaveLength(2)
    expect(emitter.history[0].phase).toBe('design')
    expect(emitter.history[1].status).toBe('completed')
  })

  it('terminalProgressListener formats events to lines', () => {
    const lines: string[] = []
    const emitter = new ProgressEmitter()

    emitter.on(terminalProgressListener((line) => lines.push(line)))
    emitter.emit({ phase: 'build', status: 'started', message: 'Building app', timestamp: 1 })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('build')
    expect(lines[0]).toContain('Building app')
  })
})

// Will be imported once implemented
import { terminalProgressListener } from '../src/progress.js'
