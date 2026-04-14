import { describe, it, expect } from 'vitest'
import { parseArgs, COMMANDS, type ParsedArgs } from '../src/cli.js'

describe('parseArgs', () => {
  it('parses "design" command with --prompt and --out', () => {
    const result = parseArgs(['design', '--prompt', 'Pet app', '--out', 'design.pen'])

    expect(result.command).toBe('design')
    expect(result.flags.prompt).toBe('Pet app')
    expect(result.flags.out).toBe('design.pen')
  })

  it('parses "spec extract" subcommand', () => {
    const result = parseArgs(['spec', 'extract', 'design.pen', '--out', 'spec.json'])

    expect(result.command).toBe('spec')
    expect(result.subcommand).toBe('extract')
    expect(result.positional).toEqual(['design.pen'])
    expect(result.flags.out).toBe('spec.json')
  })

  it('parses "spec translate" with --platform', () => {
    const result = parseArgs(['spec', 'translate', 'spec.json', '--platform', 'swiftui', '--out', 'spec.swift.json'])

    expect(result.command).toBe('spec')
    expect(result.subcommand).toBe('translate')
    expect(result.flags.platform).toBe('swiftui')
  })

  it('parses "test-gen ui" command', () => {
    const result = parseArgs(['test-gen', 'ui', 'spec.rn.json', '--out', '.maestro/'])

    expect(result.command).toBe('test-gen')
    expect(result.subcommand).toBe('ui')
    expect(result.positional).toEqual(['spec.rn.json'])
  })

  it('parses "test-gen unit" command', () => {
    const result = parseArgs(['test-gen', 'unit', 'requirements.md', '--platform', 'swiftui', '--out', '__tests__/'])

    expect(result.command).toBe('test-gen')
    expect(result.subcommand).toBe('unit')
    expect(result.flags.platform).toBe('swiftui')
  })

  it('parses "build" with --platform and --project', () => {
    const result = parseArgs(['build', '--platform', 'swiftui', '--project', './app/'])

    expect(result.command).toBe('build')
    expect(result.flags.platform).toBe('swiftui')
    expect(result.flags.project).toBe('./app/')
  })

  it('parses "validate --all"', () => {
    const result = parseArgs(['validate', '--all', '--platform', 'swiftui', '--project', './app/'])

    expect(result.command).toBe('validate')
    expect(result.flags.all).toBe(true)
  })

  it('parses "fix" with multiple flags', () => {
    const result = parseArgs(['fix', '--spec', 'spec.json', '--flows', '.maestro/', '--unit-tests', '__tests__/', '--project', './app/'])

    expect(result.command).toBe('fix')
    expect(result.flags.spec).toBe('spec.json')
    expect(result.flags.flows).toBe('.maestro/')
    expect(result.flags['unit-tests']).toBe('__tests__/')
  })

  it('parses "provision submit" with --ipa and --testflight', () => {
    const result = parseArgs(['provision', 'submit', '--ipa', 'app.ipa', '--testflight'])

    expect(result.command).toBe('provision')
    expect(result.subcommand).toBe('submit')
    expect(result.flags.ipa).toBe('app.ipa')
    expect(result.flags.testflight).toBe(true)
  })

  it('returns help command for --help', () => {
    const result = parseArgs(['--help'])
    expect(result.command).toBe('help')
  })

  it('returns version command for --version', () => {
    const result = parseArgs(['--version'])
    expect(result.command).toBe('version')
  })

  it('parses "run" with --mode add-feature', () => {
    const result = parseArgs(['run', '--prompt', 'Add dark mode', '--out', './app', '--mode', 'add-feature'])

    expect(result.command).toBe('run')
    expect(result.flags.prompt).toBe('Add dark mode')
    expect(result.flags.mode).toBe('add-feature')
  })

  it('parses "run" with --resume and no --mode (auto-detects resume)', () => {
    const result = parseArgs(['run', '--resume', 'sess-abc123', '--out', './app'])

    expect(result.command).toBe('run')
    expect(result.flags.resume).toBe('sess-abc123')
    // --mode not set — entry.ts auto-detects 'resume' from --resume flag
    expect(result.flags.mode).toBeUndefined()
  })

  describe('--add-feature flag', () => {
    it('parses --add-feature as a boolean flag', () => {
      const result = parseArgs(['run', '--prompt', 'Add settings', '--out', './app', '--add-feature'])

      expect(result.command).toBe('run')
      expect(result.flags['add-feature']).toBe(true)
      expect(result.flags.prompt).toBe('Add settings')
    })

    it('--add-feature flag does not consume next argument as value', () => {
      const result = parseArgs(['run', '--add-feature', '--prompt', 'Add settings', '--out', './app'])

      expect(result.flags['add-feature']).toBe(true)
      expect(result.flags.prompt).toBe('Add settings')
    })

    it('--add-feature takes precedence over --mode when both provided', () => {
      const result = parseArgs(['run', '--prompt', 'Add settings', '--out', './app', '--add-feature', '--mode', 'fresh'])

      // Both flags are parsed — entry.ts will give --add-feature precedence
      expect(result.flags['add-feature']).toBe(true)
      expect(result.flags.mode).toBe('fresh')
    })
  })
})

describe('COMMANDS', () => {
  it('lists all available commands', () => {
    expect(COMMANDS).toEqual(expect.arrayContaining([
      'design', 'spec', 'test-gen', 'codegen', 'build',
      'validate', 'fix', 'provision', 'report', 'setup', 'run',
    ]))
  })
})
