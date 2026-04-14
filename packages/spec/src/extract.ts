import type { DesignSpec } from '@appifex/core'
import { extractSpecFromPenObject } from './pen-extractor.js'

/**
 * Extract a DesignSpec from input string.
 * Tries .pen format first (has `children` array), then falls back to raw DesignSpec JSON.
 */
export function extractSpec(input: string): DesignSpec {
  const parsed = JSON.parse(input)

  // .pen file format — has `children` array with screen frames
  if (parsed.children && Array.isArray(parsed.children)) {
    return extractSpecFromPenObject(parsed)
  }

  // Already a DesignSpec JSON
  if (!parsed.screens || !Array.isArray(parsed.screens)) {
    throw new Error('Invalid design spec: missing screens array')
  }
  if (!parsed.version) {
    throw new Error('Invalid design spec: missing version')
  }

  return parsed as DesignSpec
}
