#!/usr/bin/env node

// ── Library re-exports (used by pipeline.ts via dynamic import of @appifex/mcp-server) ──
export { isFeaturePromptVague, generateFeatureAssumptions, hasKeywords } from './tools/refine.js'
export type { FeatureAssumption, FeatureAssumptionResult } from './tools/refine.js'
export { handleAddFeature } from './tools/add-feature.js'

// ── MCP server entry point ──
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDtcMcpServer } from './server.js'

const server = createDtcMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)
