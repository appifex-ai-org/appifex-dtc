import type { DesignSpec } from '@appifex/core'
import { extractSpecFromPenObject } from './pen-extractor.js'

/**
 * Extract a DesignSpec from Pencil MCP batch_get + get_variables responses.
 * The MCP response has the same node tree structure as .pen JSON,
 * so we reuse the existing pen-extractor logic.
 */
export function extractSpecFromMcp(
  batchGetResult: unknown,
  variables: Record<string, { type: string; value: string | number }>,
): DesignSpec {
  // The batch_get result is a node tree — wrap it as a PenDocument
  // if it's an array of nodes (top-level frames), or use as-is if it has children
  const result = batchGetResult as Record<string, unknown>

  let penDoc: { version: string; children: unknown[]; variables: Record<string, unknown> }

  if (Array.isArray(result)) {
    // batch_get returned an array of nodes directly
    penDoc = { version: '1.0', children: result, variables }
  } else if (result.type === 'frame') {
    // Single frame node — wrap as sole child
    penDoc = { version: '1.0', children: [result], variables }
  } else if (result.children && Array.isArray(result.children)) {
    // Document-like structure (has children but is not itself a frame)
    penDoc = { version: (result.version as string) ?? '1.0', children: result.children as unknown[], variables }
  } else {
    // Unknown structure — wrap as sole child
    penDoc = { version: '1.0', children: [result], variables }
  }

  // Reuse the existing pen-extractor which already handles all property extraction
  return extractSpecFromPenObject(penDoc as Parameters<typeof extractSpecFromPenObject>[0])
}
