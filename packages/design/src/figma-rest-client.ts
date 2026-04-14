import type { FigmaMcpClientLike, FigmaDesignContext } from './figma-make-adapter.js'

const FIGMA_API_BASE = 'https://api.figma.com/v1'

/**
 * Extract file key from a Figma URL.
 * Supports: https://www.figma.com/design/ABC123/Name
 *           https://www.figma.com/file/ABC123/Name
 */
export function extractFileKey(url: string): string {
  const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (!match) {
    throw new Error(`Cannot extract file key from Figma URL: ${url}`)
  }
  return match[1]
}

export interface FigmaRestClientOpts {
  token: string
  /** Injectable fetch for testing */
  fetchImpl?: typeof fetch
}

/**
 * Figma REST API client that implements FigmaMcpClientLike.
 * Uses Personal Access Token authentication.
 */
export class FigmaRestClient implements FigmaMcpClientLike {
  private token: string
  private fetchFn: typeof fetch

  constructor(opts: FigmaRestClientOpts) {
    this.token = opts.token
    this.fetchFn = opts.fetchImpl ?? globalThis.fetch
  }

  async getDesignContext(opts: { fileUrl: string; nodeId?: string }): Promise<FigmaDesignContext> {
    const fileKey = extractFileKey(opts.fileUrl)

    // Fetch file data from Figma REST API
    const url = opts.nodeId
      ? `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(opts.nodeId)}`
      : `${FIGMA_API_BASE}/files/${fileKey}`

    const resp = await this.fetchFn(url, {
      headers: { 'X-Figma-Token': this.token },
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Figma API error ${resp.status}: ${body}`)
    }

    const data = await resp.json() as FigmaFileResponse

    // Extract screen names from top-level frames
    const pages = data.document?.children ?? []
    const screenNames: string[] = []
    for (const page of pages) {
      if (page.children) {
        for (const frame of page.children) {
          if (frame.type === 'FRAME' || frame.type === 'COMPONENT') {
            screenNames.push(frame.name)
          }
        }
      }
    }

    // Build a simplified code representation from the node tree
    const code = buildCodeFromNodes(pages)

    return {
      code,
      metadata: {
        fileName: data.name ?? fileKey,
        nodeCount: countNodes(data.document),
        lastModified: data.lastModified,
      },
      screenNames: screenNames.length > 0 ? screenNames : ['Screen'],
    }
  }

  async getScreenshot(opts: { fileUrl: string; nodeId?: string }): Promise<Buffer> {
    const fileKey = extractFileKey(opts.fileUrl)

    // First, get the node IDs to render (top-level frames if no nodeId specified)
    let nodeIds: string
    if (opts.nodeId) {
      nodeIds = opts.nodeId
    } else {
      // Get file to find first page's first frame
      const fileResp = await this.fetchFn(`${FIGMA_API_BASE}/files/${fileKey}?depth=2`, {
        headers: { 'X-Figma-Token': this.token },
      })
      if (!fileResp.ok) {
        throw new Error(`Figma API error ${fileResp.status}`)
      }
      const fileData = await fileResp.json() as FigmaFileResponse
      const firstFrame = findFirstFrame(fileData.document)
      if (!firstFrame) {
        throw new Error('No frames found in Figma file')
      }
      nodeIds = firstFrame.id
    }

    // Render the node as an image
    const imageResp = await this.fetchFn(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=png&scale=2`,
      { headers: { 'X-Figma-Token': this.token } },
    )
    if (!imageResp.ok) {
      throw new Error(`Figma image API error ${imageResp.status}`)
    }

    const imageData = await imageResp.json() as { images: Record<string, string | null> }
    const imageUrl = Object.values(imageData.images).find(Boolean)
    if (!imageUrl) {
      throw new Error('Figma returned no image URL')
    }

    // Download the rendered image
    const pngResp = await this.fetchFn(imageUrl)
    if (!pngResp.ok) {
      throw new Error(`Failed to download Figma screenshot: ${pngResp.status}`)
    }

    return Buffer.from(await pngResp.arrayBuffer())
  }
}

// ── Figma API types (minimal subset) ──

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number } }>
  style?: Record<string, unknown>
  characters?: string
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
}

interface FigmaFileResponse {
  name?: string
  lastModified?: string
  document: FigmaNode
}

function countNodes(node: FigmaNode): number {
  let count = 1
  for (const child of node.children ?? []) {
    count += countNodes(child)
  }
  return count
}

function findFirstFrame(node: FigmaNode): FigmaNode | null {
  if (node.type === 'FRAME' || node.type === 'COMPONENT') return node
  for (const child of node.children ?? []) {
    const found = findFirstFrame(child)
    if (found) return found
  }
  return null
}

/** Build a simplified HTML-like representation from Figma nodes for spec extraction */
function buildCodeFromNodes(pages: FigmaNode[]): string {
  const parts: string[] = []
  for (const page of pages) {
    for (const frame of page.children ?? []) {
      if (frame.type === 'FRAME' || frame.type === 'COMPONENT') {
        parts.push(`<section data-screen="${frame.name}">\n${renderNode(frame, 1)}\n</section>`)
      }
    }
  }
  return parts.join('\n\n')
}

function renderNode(node: FigmaNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const colorAttr = extractColor(node)
  const style = colorAttr ? ` style="${colorAttr}"` : ''

  if (node.type === 'TEXT' && node.characters) {
    return `${indent}<span${style}>${node.characters}</span>`
  }

  const tag = node.type === 'TEXT' ? 'span'
    : node.type === 'RECTANGLE' ? 'div'
    : node.type === 'FRAME' || node.type === 'GROUP' ? 'div'
    : node.type === 'COMPONENT' || node.type === 'INSTANCE' ? 'div'
    : 'div'

  if (!node.children?.length) {
    return `${indent}<${tag} data-name="${node.name}"${style} />`
  }

  const children = node.children.map(c => renderNode(c, depth + 1)).join('\n')
  return `${indent}<${tag} data-name="${node.name}"${style}>\n${children}\n${indent}</${tag}>`
}

function extractColor(node: FigmaNode): string {
  const fill = node.fills?.find(f => f.type === 'SOLID' && f.color)
  if (!fill?.color) return ''
  const { r, g, b } = fill.color
  const hex = '#' + [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
  return `background-color: ${hex}`
}
