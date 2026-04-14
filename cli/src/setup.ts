import { saveConfig } from '@appifex/core'
import type { AgentConfigType, DtcConfig } from '@appifex/core'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SetupAnswers {
  llmProvider: 'anthropic' | 'openai' | 'google' | 'copilot'
  llmApiKey: string
  llmModel?: string
  githubToken?: string
  designTool: 'pencil' | 'stitch' | 'figma-make'
  designApiKey?: string
  figmaToken?: string
  figmaFileUrl?: string
  runnerType: 'local' | 'e2b' | 'remote'
  sandboxId?: string
  runnerUrl?: string
  runnerToken?: string
  agentType?: AgentConfigType
  appleTeamId?: string
  appleBundleId?: string
  ascAppId?: string
  ascKeyId?: string
  ascIssuerId?: string
  ascKeyPath?: string
  ascTestFlightGroup?: string
  androidServiceAccountKeyPath?: string
  androidPackageName?: string
  androidKeystorePath?: string
  androidKeystorePassword?: string
  androidKeyAlias?: string
  androidKeyPassword?: string
  androidPlayTrack?: string
  tokenBudget?: number
  skillsDir?: string
  deliverEnabled?: boolean
  deliverRemoteUrl?: string
  deliverBaseBranch?: string
  deliverAutoMerge?: boolean
  deliverMergeMethod?: 'squash' | 'merge' | 'rebase'
  deliverRepoVisibility?: 'private' | 'public'
  deliverUserName?: string
  deliverUserEmail?: string
  baasProvider?: 'firebase' | 'supabase'
  baasSkipTemplate?: boolean
}

export async function runSetup(configDir: string, answers: SetupAnswers): Promise<void> {
  const config: DtcConfig = {
    llm: {
      provider: answers.llmProvider,
      apiKey: answers.llmApiKey,
      model: answers.llmModel,
      githubToken: answers.githubToken,
    },
    design: {
      tool: answers.designTool,
      apiKey: answers.designApiKey,
      figmaToken: answers.figmaToken,
      figmaFileUrl: answers.figmaFileUrl,
    },
    runner: {
      type: answers.runnerType,
      sandboxId: answers.sandboxId,
      runnerUrl: answers.runnerUrl,
      runnerToken: answers.runnerToken,
    },
  }

  if (answers.appleTeamId && answers.appleBundleId) {
    config.apple = {
      teamId: answers.appleTeamId,
      bundleId: answers.appleBundleId,
      ascAppId: answers.ascAppId,
      ascKeyId: answers.ascKeyId,
      ascIssuerId: answers.ascIssuerId,
      ascKeyPath: answers.ascKeyPath,
      ascTestFlightGroup: answers.ascTestFlightGroup || undefined,
    }
  }

  if (answers.androidServiceAccountKeyPath && answers.androidPackageName) {
    config.android = {
      serviceAccountKeyPath: answers.androidServiceAccountKeyPath,
      packageName: answers.androidPackageName,
      playTrack: answers.androidPlayTrack || undefined,
      ...(answers.androidKeystorePath
        ? {
            keystorePath: answers.androidKeystorePath,
            keystorePassword: answers.androidKeystorePassword ?? '',
            keyAlias: answers.androidKeyAlias ?? 'release',
            keyPassword: answers.androidKeyPassword ?? '',
          }
        : {}),
    }
  }

  if (answers.agentType) {
    config.agent = { type: answers.agentType }
  }

  if (answers.tokenBudget) {
    config.tokenBudget = { total: answers.tokenBudget }
  }

  if (answers.skillsDir) {
    config.skillsDir = answers.skillsDir
  }

  if (answers.baasProvider) {
    config.baas = { provider: answers.baasProvider }
  }

  if (answers.deliverEnabled) {
    const deliver: Record<string, unknown> = {
      baseBranch: answers.deliverBaseBranch ?? 'main',
    }
    if (answers.deliverRemoteUrl) deliver.remoteUrl = answers.deliverRemoteUrl
    if (answers.deliverAutoMerge != null) deliver.autoMerge = answers.deliverAutoMerge
    if (answers.deliverMergeMethod) deliver.mergeMethod = answers.deliverMergeMethod
    if (answers.deliverRepoVisibility) deliver.repoVisibility = answers.deliverRepoVisibility
    if (answers.deliverUserName) deliver.userName = answers.deliverUserName
    if (answers.deliverUserEmail) deliver.userEmail = answers.deliverUserEmail
    config.deliver = deliver as DtcConfig['deliver']
  }

  await saveConfig(configDir, config)

  // Auto-add Pencil MCP server to .mcp.json when Pencil is the design tool
  if (answers.designTool === 'pencil') {
    ensurePencilMcp()
  }
}

/** Add the Pencil MCP server entry to the nearest .mcp.json if not already present */
function ensurePencilMcp(): void {
  // Find .mcp.json: walk up from cwd
  let dir = process.cwd()
  let mcpPath: string | null = null
  while (true) {
    const candidate = join(dir, '.mcp.json')
    if (existsSync(candidate)) {
      mcpPath = candidate
      break
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  if (!mcpPath) return // no .mcp.json found — user will need to add manually

  try {
    const raw = readFileSync(mcpPath, 'utf-8')
    const mcp = JSON.parse(raw)
    if (!mcp.mcpServers) mcp.mcpServers = {}
    if (mcp.mcpServers.pencil) return // already configured

    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const bin = `/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-${arch}`
    if (!existsSync(bin)) return // Pencil not installed — skip

    mcp.mcpServers = { pencil: { command: bin, args: ['--app', 'desktop'] }, ...mcp.mcpServers }
    writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n')
  } catch {
    // Best-effort — don't fail setup if .mcp.json can't be updated
  }
}
