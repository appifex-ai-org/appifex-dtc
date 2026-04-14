import type { FlowResult } from '@appifex/core'

export function parseJunitXml(xml: string): { total: number; passed: number; failed: number; results: FlowResult[] } {
  const results: FlowResult[] = []

  // Extract all <testcase ...>...</testcase> or <testcase .../> blocks
  const testcaseRegex = /<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
  let match: RegExpExecArray | null

  while ((match = testcaseRegex.exec(xml)) !== null) {
    const attrs = match[1]
    const inner = match[2] ?? ''

    const nameMatch = attrs.match(/name="([^"]*)"/)
    const timeMatch = attrs.match(/time="([^"]*)"/)
    const name = nameMatch?.[1] ?? 'unknown'
    const time = parseFloat(timeMatch?.[1] ?? '0')

    const failureMatch = inner.match(/<failure[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/)

    results.push({
      flowName: name,
      passed: !failureMatch,
      duration: time * 1000,
      error: failureMatch ? (failureMatch[2]?.trim() || failureMatch[1] || 'Unknown failure') : undefined,
      assertions: [],
    })
  }

  const passed = results.filter(r => r.passed).length
  return { total: results.length, passed, failed: results.length - passed, results }
}
