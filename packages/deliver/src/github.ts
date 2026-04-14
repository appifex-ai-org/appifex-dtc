import type { Runner } from '@appifex/core'

export interface PullRequestOpts {
  owner: string
  repo: string
  title: string
  body: string
  head: string
  base: string
}

export type MergeMethod = 'squash' | 'merge' | 'rebase'

export interface PullRequestResult {
  number: number
  url: string
  title: string
  merged: boolean
  mergeMethod?: MergeMethod
}

export interface CreateRepoResult {
  url: string
  owner: string
  repo: string
}

/**
 * Creates a GitHub repository using the `gh` CLI.
 * If the repo already exists, returns its URL instead of failing.
 */
export async function createRepo(
  runner: Runner,
  name: string,
  opts?: { private?: boolean; description?: string },
): Promise<CreateRepoResult> {
  const visibility = opts?.private !== false ? '--private' : '--public'
  const args = ['repo', 'create', name, visibility]
  if (opts?.description) args.push('--description', opts.description)
  // Request JSON output for reliable parsing (also makes it non-interactive)
  args.push('--json', 'url', '-q', '.url')

  const result = await runner.exec('gh', args, {
    env: { GH_PROMPT_DISABLED: '1' },
  })

  if (result.exitCode !== 0) {
    // Repo already exists — resolve its URL instead of failing
    const stderr = result.stderr.toLowerCase()
    if (stderr.includes('already exists') || stderr.includes('name already exists')) {
      return resolveExistingRepo(runner, name)
    }
    throw new Error(`gh repo create failed: ${result.stderr}`)
  }

  const url = result.stdout.trim()
  if (!url) return resolveExistingRepo(runner, name)

  const parsed = parseGithubUrl(url)
  if (!parsed) throw new Error(`Could not parse owner/repo from: ${url}`)
  return parsed
}

async function resolveExistingRepo(
  runner: Runner,
  name: string,
): Promise<CreateRepoResult> {
  // If name includes owner (e.g. "owner/repo"), use it directly
  // Otherwise, look up the authenticated user
  let fullName = name
  if (!name.includes('/')) {
    const whoami = await runner.exec('gh', ['api', 'user', '-q', '.login'])
    fullName = `${whoami.stdout.trim()}/${name}`
  }

  // Verify the repo exists and get its URL
  const view = await runner.exec('gh', ['repo', 'view', fullName, '--json', 'url', '-q', '.url'])
  const url = view.stdout.trim()
  if (view.exitCode !== 0 || !url) {
    throw new Error(`Could not resolve existing repo: ${fullName}`)
  }

  const parsed = parseGithubUrl(url)
  if (!parsed) {
    throw new Error(`Could not parse owner/repo from: ${url}`)
  }
  return parsed
}

function parseGithubUrl(url: string): CreateRepoResult | undefined {
  const match = url.match(/github\.com\/([^/]+)\/([^/.]+)/)
  if (!match) return undefined
  const cleanUrl = url.endsWith('.git') ? url : `${url}.git`
  return { url: cleanUrl, owner: match[1]!, repo: match[2]! }
}

/**
 * Creates a GitHub pull request using the `gh` CLI.
 */
export async function createPullRequest(
  runner: Runner,
  opts: PullRequestOpts,
): Promise<PullRequestResult> {
  const result = await runner.exec('gh', [
    'pr', 'create',
    '--repo', `${opts.owner}/${opts.repo}`,
    '--title', opts.title,
    '--body', opts.body,
    '--head', opts.head,
    '--base', opts.base,
  ])

  if (result.exitCode !== 0) {
    throw new Error(`gh pr create failed: ${result.stderr}`)
  }

  // gh pr create outputs the PR URL on stdout
  const url = result.stdout.trim()
  const prNumber = parseInt(url.split('/').pop() ?? '0', 10)

  return { number: prNumber, url, title: opts.title, merged: false }
}

/**
 * Merges an open PR using the `gh` CLI.
 */
export async function mergePullRequest(
  runner: Runner,
  opts: { owner: string; repo: string; prNumber: number; method?: MergeMethod; deleteBranch?: boolean },
): Promise<void> {
  const method = opts.method ?? 'squash'
  const args = [
    'pr', 'merge', String(opts.prNumber),
    '--repo', `${opts.owner}/${opts.repo}`,
    `--${method}`,
  ]
  if (opts.deleteBranch ?? true) args.push('--delete-branch')

  const result = await runner.exec('gh', args)
  if (result.exitCode !== 0) {
    throw new Error(`gh pr merge failed: ${result.stderr}`)
  }
}
