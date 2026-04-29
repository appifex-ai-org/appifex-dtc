#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'

const MAX_SCAN_BYTES = 1024 * 1024
const SECRET_MARKERS = [
  '-----BEGIN PRIVATE KEY-----',
  'APPLE_ID_PASSWORD',
  'ASC_PRIVATE_KEY',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS=',
  'ANTHROPIC_API_KEY=',
  'OPENAI_API_KEY=',
  'GEMINI_API_KEY=',
]

function usage() {
  console.error('Usage: node scripts/verify-tiny-mock-output.mjs --out <generated-output-dir>')
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--out' || !argv[1]) {
    usage()
    process.exit(2)
  }
  return resolve(process.cwd(), argv[1])
}

function rel(root, path) {
  return relative(root, path) || '.'
}

function fail(message) {
  console.error(`tiny-mock verification failed: ${message}`)
  process.exitCode = 1
}

function requirePath(root, relativePath, kind) {
  const path = join(root, relativePath)
  if (!existsSync(path)) {
    fail(`missing required ${kind}: ${relativePath}`)
    return false
  }
  const stat = lstatSync(path)
  if (kind === 'directory' && !stat.isDirectory()) {
    fail(`expected directory at ${relativePath}`)
    return false
  }
  if (kind === 'file' && !stat.isFile()) {
    fail(`expected file at ${relativePath}`)
    return false
  }
  return true
}

function walkFiles(root, visit) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry))
      }
      continue
    }
    if (stat.isFile()) visit(current, stat)
  }
}

function hasSwiftFile(root) {
  let found = false
  walkFiles(root, (path) => {
    if (path.endsWith('.swift')) found = true
  })
  return found
}

function validateRunContext(root) {
  const path = join(root, '.dtc', 'run-context.json')
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    fail(`invalid .dtc/run-context.json: ${String(err)}`)
    return
  }

  if (!parsed || typeof parsed !== 'object') {
    fail('.dtc/run-context.json must contain an object')
    return
  }
  if (typeof parsed.runId !== 'string' || parsed.runId.length === 0) {
    fail('.dtc/run-context.json missing runId')
  }
  if (typeof parsed.platform !== 'string' || parsed.platform.length === 0) {
    fail('.dtc/run-context.json missing platform')
  }
  if (!Array.isArray(parsed.phases) && (!parsed.phases || typeof parsed.phases !== 'object')) {
    fail('.dtc/run-context.json missing phases')
  }
}

function looksBinary(buffer) {
  return buffer.includes(0)
}

function scanSecrets(root) {
  walkFiles(root, (path, stat) => {
    if (stat.size > MAX_SCAN_BYTES) return
    let buffer
    try {
      buffer = readFileSync(path)
    } catch {
      return
    }
    if (looksBinary(buffer)) return
    const text = buffer.toString('utf8')
    for (const marker of SECRET_MARKERS) {
      if (text.includes(marker)) {
        fail(`credential marker ${marker} found in ${rel(root, path)}`)
      }
    }
  })
}

function main() {
  const outRoot = parseArgs(process.argv.slice(2))
  if (!existsSync(outRoot) || !statSync(outRoot).isDirectory()) {
    fail(`output directory does not exist: ${outRoot}`)
  } else {
    requirePath(outRoot, '.dtc/run-context.json', 'file')
    requirePath(outRoot, 'project.yml', 'file')
    requirePath(outRoot, 'App.xcodeproj', 'directory')

    if (!hasSwiftFile(outRoot)) {
      fail('missing required Swift source file: no .swift files found')
    }

    if (process.exitCode !== 1) validateRunContext(outRoot)
    scanSecrets(outRoot)
  }

  if (process.exitCode === 1) process.exit(1)
  console.log(`tiny-mock output verified: ${outRoot}`)
}

main()
