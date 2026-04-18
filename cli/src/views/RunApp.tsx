import chalk from 'chalk'
import { ProgressEmitter, type ProgressEvent, type PhaseId } from '@appifex/core'
import { runPipeline, type PipelineOpts, type PipelineResult } from '../pipeline.js'

const STATUS_ICONS: Record<string, string> = {
  started: chalk.cyan('◐'),
  running: chalk.cyan('◐'),
  completed: chalk.green('✓'),
  failed: chalk.red('✗'),
  skipped: chalk.dim('–'),
}

const TIPS = [
  'Pencil is designing your screens with AI — this usually takes 4–5 minutes',
  'The design will open in Preview.app when ready for review',
  'You can bring your own .pen file with --design ./my-design.pen',
  'Tests are generated before code — they become the contract for code gen',
  'The fix loop will auto-fix build errors and failing tests',
  'Use dtc setup to change your LLM model or provider',
  'Gemini 3.1 Pro is recommended for code generation',
  'SwiftUI builds use xcodegen to auto-create the Xcode project',
  'All generated files are saved in your --out directory',
  'The report is saved as report.md in your output directory',
]

let totalTokens = 0
let pipelineStart = 0
const phaseTimers = new Map<string, number>()
let spinnerInterval: ReturnType<typeof setInterval> | undefined
let currentPhase: string | null = null
let currentMessage: string | null = null
let stepStart: number | null = null

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m${secs}s`
}

/** Print a completed step line with timestamp */
function printStep(phase: string, message: string, elapsed: number) {
  const label = phase.charAt(0).toUpperCase() + phase.slice(1).replace('_', ' ')
  const padded = label.padEnd(12)
  const timeStr = chalk.dim(` (${formatDuration(elapsed)})`)
  console.log(`  ${chalk.dim('·')} ${chalk.bold(padded)}${chalk.dim(` ${message}`)}${timeStr}`)
}

function logEvent(event: ProgressEvent) {
  if (event.tokensUsed) {
    totalTokens += event.tokensUsed
  }

  // Phase timing
  if (event.status === 'started') {
    phaseTimers.set(event.phase, Date.now())
  }

  const icon = STATUS_ICONS[event.status] ?? chalk.dim('○')
  const label = event.phase.charAt(0).toUpperCase() + event.phase.slice(1).replace('_', ' ')
  const padded = label.padEnd(12)
  const msg = event.message ? chalk.dim(` ${event.message}`) : ''

  if (event.status === 'running') {
    // For running events: print the previous step with its elapsed time, then start new spinner
    const isNewStep = event.phase !== currentPhase || event.message !== currentMessage

    if (isNewStep && currentPhase && currentMessage && stepStart) {
      // Stop spinner and print completed step with elapsed time
      stopSpinner()
      printStep(currentPhase, currentMessage, Date.now() - stepStart)
    } else {
      stopSpinner()
    }

    currentPhase = event.phase
    currentMessage = event.message ?? null
    stepStart = Date.now()

    startSpinner(padded)
    return
  }

  // For started/completed/failed/skipped: stop spinner and print the previous running step
  if (currentPhase && currentMessage && stepStart) {
    stopSpinner()
    printStep(currentPhase, currentMessage, Date.now() - stepStart)
    currentPhase = null
    currentMessage = null
    stepStart = null
  } else {
    stopSpinner()
  }

  let timeStr = ''
  let tokenStr = ''
  if (event.status === 'completed' || event.status === 'failed') {
    const start = phaseTimers.get(event.phase)
    if (start) {
      const elapsed = Date.now() - start
      timeStr = formatDuration(elapsed)
    }
    if (event.tokensUsed && event.tokensUsed > 0) {
      tokenStr = `${event.tokensUsed.toLocaleString()} tokens`
    }
  }

  const meta = [timeStr, tokenStr].filter(Boolean).join(', ')
  const metaStr = meta ? chalk.dim(` (${meta})`) : ''

  console.log(`  ${icon} ${chalk.bold(padded)}${msg}${metaStr}`)

  if (event.status === 'started') {
    startSpinner(padded)
  }
}

function startSpinner(padded: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let frameIdx = 0
  let tipIdx = Math.floor(Math.random() * TIPS.length)
  let showTip = false
  const phaseStart = Date.now()
  const cols = process.stdout.columns || 80

  const tipTimer = setTimeout(() => {
    showTip = true
  }, 5_000)
  const tipRotate = setInterval(() => {
    tipIdx++
  }, 8_000)

  spinnerInterval = setInterval(() => {
    const elapsed = formatDuration(Date.now() - phaseStart)
    const frame = chalk.cyan(frames[frameIdx % frames.length])
    const msgPart = currentMessage ? chalk.dim(` ${currentMessage}`) : ''
    const tip = showTip ? chalk.dim(` · ${TIPS[tipIdx % TIPS.length]}`) : ''
    const line = `  ${frame} ${chalk.bold(padded)}${msgPart} ${chalk.dim(elapsed)}${tip}`
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '')
    const truncated =
      visible.length > cols ? line.slice(0, line.length - (visible.length - cols)) : line
    process.stdout.write(`\r${truncated}\x1b[K`)
    frameIdx++
  }, 100)
  ;(spinnerInterval as any).__cleanup = () => {
    clearTimeout(tipTimer)
    clearInterval(tipRotate)
  }
}

function stopSpinner() {
  if (spinnerInterval) {
    if ((spinnerInterval as any).__cleanup) (spinnerInterval as any).__cleanup()
    clearInterval(spinnerInterval)
    spinnerInterval = undefined
    process.stdout.write('\r\x1b[K')
  }
}

export async function renderRunApp(opts: PipelineOpts) {
  const progress = new ProgressEmitter()
  totalTokens = 0
  pipelineStart = Date.now()
  phaseTimers.clear()
  currentPhase = null
  currentMessage = null
  stepStart = null

  console.log()
  console.log(`  ${chalk.bold(opts.prompt)}`)
  console.log()

  progress.on(logEvent)

  try {
    // Phase 7 (MCP-03 D-10 + OBS-03 D-16 — revision W-04): opts already contains
    // overwriteUserEdits + exportDebugBundle threaded from ParsedArgs via entry.ts.
    const result = await runPipeline(opts, progress)
    stopSpinner()

    // Flush any remaining running step
    if (currentPhase && currentMessage && stepStart) {
      printStep(currentPhase, currentMessage, Date.now() - stepStart)
      currentPhase = null
      currentMessage = null
      stepStart = null
    }

    const totalDuration = Date.now() - pipelineStart

    console.log()
    const s = result.report.summary
    const status = s.allGreen ? chalk.green('✅ Complete') : chalk.red('⛔ Issues found')
    console.log(`  ${status}  ${chalk.dim(formatDuration(totalDuration))}`)
    console.log()

    for (const pr of result.report.platformReports) {
      const ui = `UI ${pr.uiTests.passed}/${pr.uiTests.total}`
      const unit = `Unit ${pr.unitTests.passed}/${pr.unitTests.total}`
      console.log(`  ${pr.platform.padEnd(16)} ${ui}  ${unit}`)
    }

    const tokenEntries = Object.entries(result.report.tokenUsage).filter(([, v]) => v && v > 0)
    if (tokenEntries.length > 0) {
      console.log()
      console.log(chalk.dim(`  Token breakdown:`))
      for (const [phase, tokens] of tokenEntries) {
        console.log(chalk.dim(`    ${phase.padEnd(12)} ${tokens!.toLocaleString()}`))
      }
    }

    console.log()
    console.log(
      chalk.dim(
        `  Total: ${s.totalTokens.toLocaleString()} tokens  ${formatDuration(totalDuration)}  Design: ${s.designIterations} iteration${s.designIterations !== 1 ? 's' : ''}  Fix: ${s.fixAttempts} attempt${s.fixAttempts !== 1 ? 's' : ''}`,
      ),
    )
    console.log()
  } catch (err) {
    stopSpinner()
    const totalDuration = Date.now() - pipelineStart
    console.log()
    console.log(
      chalk.red(`  ✗ Pipeline failed: ${err instanceof Error ? err.message : err}`) +
        chalk.dim(` (${formatDuration(totalDuration)})`),
    )
    console.log()
    process.exit(1)
  }
}
