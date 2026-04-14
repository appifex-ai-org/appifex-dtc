import type { ProgressEvent } from './types.js'

export type ProgressListener = (event: ProgressEvent) => void

export class ProgressEmitter {
  private listeners: Set<ProgressListener> = new Set()
  private _history: ProgressEvent[] = []

  on(listener: ProgressListener): void {
    this.listeners.add(listener)
  }

  off(listener: ProgressListener): void {
    this.listeners.delete(listener)
  }

  emit(event: ProgressEvent): void {
    this._history.push(event)
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  get history(): readonly ProgressEvent[] {
    return this._history
  }
}

const STATUS_ICONS: Record<string, string> = {
  started: '●',
  running: '◐',
  completed: '✓',
  failed: '✗',
  skipped: '○',
}

export function terminalProgressListener(write: (line: string) => void): ProgressListener {
  return (event: ProgressEvent) => {
    const icon = STATUS_ICONS[event.status] ?? '?'
    const tokens = event.tokensUsed ? ` [${event.tokensUsed} tokens]` : ''
    write(`${icon} ${event.phase}: ${event.message}${tokens}`)
  }
}
