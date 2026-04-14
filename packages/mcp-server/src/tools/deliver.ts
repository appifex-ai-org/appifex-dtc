import { deliver } from '@appifex/deliver'
import type { Runner, DtcConfig } from '@appifex/core'

export async function handleDeliver(
  args: {
    projectDir: string
    branch?: string
    baseBranch?: string
    remoteUrl?: string
    skipPr?: boolean
    skipPush?: boolean
    summary?: string
    autoMerge?: boolean
    allTestsGreen?: boolean
  },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  try {
    const deliverConfig = config.deliver ?? {}
    const result = await deliver(runner, {
      projectDir: args.projectDir,
      branch: args.branch,
      baseBranch: args.baseBranch ?? deliverConfig.baseBranch,
      remoteUrl: args.remoteUrl ?? deliverConfig.remoteUrl,
      repo: deliverConfig.repo,
      skipPr: args.skipPr ?? deliverConfig.skipPr,
      skipPush: args.skipPush ?? deliverConfig.skipPush,
      git: { userName: deliverConfig.userName, userEmail: deliverConfig.userEmail },
      summary: args.summary,
      autoMerge: args.autoMerge ?? deliverConfig.autoMerge,
      mergeMethod: deliverConfig.mergeMethod,
      deleteBranchOnMerge: deliverConfig.deleteBranchOnMerge,
      allTestsGreen: args.allTestsGreen,
    })
    return {
      text: JSON.stringify(result, null, 2),
      isError: false,
    }
  } catch (err) {
    return {
      text: `Deliver failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
