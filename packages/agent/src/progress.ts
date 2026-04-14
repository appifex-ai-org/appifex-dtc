import type { PhaseId, ProgressEvent } from '@appifex/core'
import type { AgentType } from './types.js'

export interface ProgressParser {
  /** Parse a chunk of agent stdout and return any progress events */
  parse(chunk: string): ProgressEvent[]
}

/** Create a progress parser for the given agent type */
export function createProgressParser(agentType: AgentType): ProgressParser {
  switch (agentType) {
    case 'claude': return new ClaudeStreamJsonParser()
    case 'codex': return new CodexProgressParser()
    case 'gemini': return new GeminiProgressParser()
    default: return new GenericProgressParser()
  }
}

/**
 * Parse Claude CLI --output-format=stream-json events.
 * Each line is a JSON object with a "type" field.
 * Tool uses appear as: {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{...}}]}}
 */
class ClaudeStreamJsonParser implements ProgressParser {
  private currentPhase: PhaseId = 'codegen'
  private buffer = ''
  private filesWritten = 0
  private buildAttempts = 0

  parse(chunk: string): ProgressEvent[] {
    const events: ProgressEvent[] = []

    // Buffer incomplete lines
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? '' // keep the last incomplete line

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        const parsed = this.parseEvent(event)
        if (parsed) events.push(parsed)
      } catch { /* not valid JSON, skip */ }
    }

    return events
  }

  private parseEvent(event: StreamEvent): ProgressEvent | null {
    // Tool use events — these tell us what the agent is doing
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use' && block.name) {
          return this.parseToolUse(block.name, block.input ?? {})
        }
      }
    }

    // Result event — final status
    if (event.type === 'result') {
      if (event.is_error) {
        return this.event(this.currentPhase, 'failed', event.errors?.[0] ?? 'Agent failed')
      }
    }

    return null
  }

  private parseToolUse(toolName: string, input: Record<string, unknown>): ProgressEvent | null {
    switch (toolName) {
      case 'Read': {
        const path = String(input.file_path ?? '')
        if (path.includes('preview.png') || path.endsWith('.png') || path.endsWith('.jpg')) {
          return this.event('codegen', 'running', 'Reading design image')
        }
        if (path.includes('skills/')) {
          return this.event(this.currentPhase, 'running', `Reading skill: ${path.split('/').pop()}`)
        }
        if (path.endsWith('.swift') || path.endsWith('.ts') || path.endsWith('.tsx')) {
          return this.event(this.currentPhase, 'running', `Reading ${path.split('/').pop()}`)
        }
        return null
      }

      case 'Write': {
        this.filesWritten++
        const path = String(input.file_path ?? '')
        const fileName = path.split('/').pop() ?? path
        if (this.currentPhase !== 'codegen') this.currentPhase = 'codegen'
        return this.event('codegen', 'running', `Writing ${fileName} (${this.filesWritten} files)`)
      }

      case 'Edit': {
        const path = String(input.file_path ?? '')
        const fileName = path.split('/').pop() ?? path
        if (this.currentPhase === 'fix') {
          return this.event('fix', 'running', `Fixing ${fileName}`)
        }
        return this.event('codegen', 'running', `Editing ${fileName}`)
      }

      case 'Bash': {
        const cmd = String(input.command ?? '')
        if (cmd.includes('xcodegen generate')) {
          return this.event('build', 'running', 'Generating Xcode project')
        }
        if (cmd.includes('xcodebuild build')) {
          this.buildAttempts++
          this.currentPhase = 'build'
          return this.event('build', 'running', `Building (attempt ${this.buildAttempts})`)
        }
        if (cmd.includes('xcodebuild test')) {
          this.currentPhase = 'validate'
          return this.event('validate', 'running', 'Running unit tests')
        }
        if (cmd.includes('maestro test')) {
          this.currentPhase = 'validate'
          return this.event('validate', 'running', 'Running Maestro UI tests')
        }
        if (cmd.includes('npm install')) {
          this.currentPhase = 'build'
          return this.event('build', 'running', 'Building project')
        }
        if (cmd.includes('npx jest')) {
          this.currentPhase = 'validate'
          return this.event('validate', 'running', 'Running tests')
        }
        return null
      }

      case 'Glob':
      case 'Grep':
        // Agent is searching for something — probably during fix
        if (this.currentPhase === 'build' || this.currentPhase === 'validate') {
          this.currentPhase = 'fix'
          return this.event('fix', 'running', 'Investigating errors')
        }
        return null

      default:
        return null
    }
  }

  private event(phase: PhaseId, status: ProgressEvent['status'], message: string): ProgressEvent {
    return { phase, status, message, timestamp: Date.now() }
  }
}

// Minimal types for stream-json parsing
interface StreamEvent {
  type: string
  subtype?: string
  message?: {
    content?: Array<{
      type: string
      name?: string
      text?: string
      input?: Record<string, unknown>
    }>
  }
  is_error?: boolean
  errors?: string[]
}

class CodexProgressParser implements ProgressParser {
  parse(chunk: string): ProgressEvent[] {
    const events: ProgressEvent[] = []
    for (const line of chunk.split('\n')) {
      try {
        const event = JSON.parse(line) as { type?: string; tool?: string; args?: string }
        if (event.type === 'tool_call') {
          if (event.tool === 'shell' && event.args?.includes('xcodebuild')) {
            events.push({ phase: 'build', status: 'running', message: 'Building', timestamp: Date.now() })
          }
        }
      } catch { /* not JSON, skip */ }
    }
    return events
  }
}

class GeminiProgressParser implements ProgressParser {
  parse(chunk: string): ProgressEvent[] {
    const events: ProgressEvent[] = []
    if (chunk.includes('xcodebuild build')) {
      events.push({ phase: 'build', status: 'running', message: 'Building', timestamp: Date.now() })
    }
    if (chunk.includes('xcodebuild test')) {
      events.push({ phase: 'validate', status: 'running', message: 'Running tests', timestamp: Date.now() })
    }
    return events
  }
}

class GenericProgressParser implements ProgressParser {
  parse(_chunk: string): ProgressEvent[] {
    return []
  }
}
