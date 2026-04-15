// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import chalk from 'chalk'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runDeliverSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const wantDeliver = await p.confirm({
    message: 'Configure git delivery? (commit, push, PR)',
    initialValue: existingConfig.deliver != null,
  })
  assertNotCancelled(wantDeliver)

  if (!wantDeliver) return

  const { execSync } = await import('node:child_process')

  let deliverRemoteUrl: string | undefined = existingConfig.deliver?.remoteUrl
  let deliverRepoVisibility: 'private' | 'public' | undefined =
    existingConfig.deliver?.repoVisibility

  const remoteUrlInput = await p.text({
    message: 'Remote repository URL (leave empty to auto-create on GitHub)',
    initialValue: existingConfig.deliver?.remoteUrl ?? '',
    validate: (v) => {
      if (!v) return undefined
      if (!v.includes('github.com/'))
        return 'Must be a GitHub URL (e.g. https://github.com/owner/repo.git)'
      if (v.includes('owner/repo'))
        return 'Please enter your actual repository URL, not the example'
      return undefined
    },
  })
  assertNotCancelled(remoteUrlInput)

  if (remoteUrlInput) {
    deliverRemoteUrl = remoteUrlInput as string
  } else {
    try {
      execSync('gh auth status', { stdio: 'ignore' })
      p.log.success('Authenticated via `gh` CLI')
    } catch {
      throw new Error(
        '`gh` CLI is required for auto-creating repos. Install it (https://cli.github.com) and run `gh auth login`, or provide a remote URL.',
      )
    }

    const visibility = await p.select({
      message: 'Repo visibility',
      options: [
        { value: 'private', label: 'Private' },
        { value: 'public', label: 'Public' },
      ],
    })
    assertNotCancelled(visibility)
    deliverRepoVisibility = visibility as 'private' | 'public'

    const repoName = await p.text({
      message: 'Repository name (leave empty to auto-create at runtime from prompt)',
    })
    assertNotCancelled(repoName)

    if (repoName) {
      const s = p.spinner()
      s.start(`Creating GitHub repo: ${repoName as string} (${deliverRepoVisibility})`)
      try {
        const output = execSync(`gh repo create ${repoName as string} --${deliverRepoVisibility}`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
        deliverRemoteUrl =
          output ||
          `https://github.com/${execSync('gh api user -q .login', { encoding: 'utf-8' }).trim()}/${repoName as string}.git`
        s.stop(chalk.green(`Created: ${deliverRemoteUrl}`))
      } catch (err) {
        s.stop(chalk.red('Failed to create repo'))
        const msg =
          err instanceof Error
            ? ((err as { stderr?: string }).stderr ?? err.message)
            : String(err)
        throw new Error(`gh repo create failed: ${msg}`)
      }
    } else {
      p.log.info('Repo will be auto-created at runtime from the prompt')
    }
  }

  const baseBranchInput = await p.text({
    message: 'Base branch for PRs',
    initialValue: existingConfig.deliver?.baseBranch ?? 'main',
  })
  assertNotCancelled(baseBranchInput)
  const deliverBaseBranch = baseBranchInput as string

  const autoMergeInput = await p.confirm({
    message: 'Auto-merge PRs when all tests pass?',
    initialValue: existingConfig.deliver?.autoMerge ?? false,
  })
  assertNotCancelled(autoMergeInput)
  const deliverAutoMerge = autoMergeInput as boolean

  let deliverMergeMethod: 'squash' | 'merge' | 'rebase' | undefined =
    existingConfig.deliver?.mergeMethod

  if (deliverAutoMerge) {
    const methodInput = await p.select({
      message: 'Merge method',
      options: [
        { value: 'squash', label: 'Squash', hint: 'single commit on base branch (recommended)' },
        { value: 'merge', label: 'Merge commit', hint: 'preserves branch history' },
        { value: 'rebase', label: 'Rebase', hint: 'linear history' },
      ],
    })
    assertNotCancelled(methodInput)
    deliverMergeMethod = methodInput as 'squash' | 'merge' | 'rebase'
  }

  const gitNameInput = await p.text({
    message: 'Git user name (for commits)',
    placeholder: 'dtc-bot',
    initialValue: existingConfig.deliver?.userName ?? '',
  })
  assertNotCancelled(gitNameInput)
  const deliverUserName = (gitNameInput as string) || undefined

  const gitEmailInput = await p.text({
    message: 'Git user email (for commits)',
    placeholder: 'dtc@example.com',
    initialValue: existingConfig.deliver?.userEmail ?? '',
  })
  assertNotCancelled(gitEmailInput)
  const deliverUserEmail = (gitEmailInput as string) || undefined

  const deliver: DtcConfig['deliver'] = {
    baseBranch: deliverBaseBranch,
  }
  if (deliverRemoteUrl) deliver.remoteUrl = deliverRemoteUrl
  if (deliverAutoMerge != null) deliver.autoMerge = deliverAutoMerge
  if (deliverMergeMethod) deliver.mergeMethod = deliverMergeMethod
  if (deliverRepoVisibility) deliver.repoVisibility = deliverRepoVisibility
  if (deliverUserName) deliver.userName = deliverUserName
  if (deliverUserEmail) deliver.userEmail = deliverUserEmail

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, { ...cfg, deliver })
}
