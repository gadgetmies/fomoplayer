'use strict'

// GitHub dispatcher for the Sentry triage webhook. Wraps the Octokit calls
// the route needs:
//
//   - findOpenForSentryIssue(sentryId)  → first open issue or PR carrying
//                                         label `sentry:<id>` (or null)
//   - findPriorAttempts(sentryId)       → closed issues + their merged PRs
//   - hasWontFix(sentryId)              → true if `wont-fix` is present
//   - countInFlightFixPRs()             → open PRs labelled `sentry-fix`
//   - countTodayDispatches()            → issues labelled `sentry-fix`
//                                         opened in the last 24h
//   - createTriageIssue(event, prior)   → new GH issue with both labels
//                                         and a Prior attempts section
//   - triggerFixWorkflow(issueNumber)   → workflow_dispatch on sentry-fix.yml
//
// Auth: GitHub App installation token via @octokit/auth-app when the App env
// vars are set, otherwise GITHUB_TOKEN as a v0 spike fallback.

const SENTRY_FIX_LABEL = 'sentry-fix'
const WONT_FIX_LABEL = 'wont-fix'
const FIX_WORKFLOW_FILE = 'sentry-fix.yml'
const DEFAULT_REF = 'master'

const sentryLabel = (sentryId) => `sentry:${sentryId}`

const parseRepo = (slug) => {
  if (!slug || typeof slug !== 'string') {
    throw new Error('GITHUB_REPO must be set to "<owner>/<repo>"')
  }
  const [owner, repo] = slug.split('/')
  if (!owner || !repo) throw new Error(`GITHUB_REPO must be "<owner>/<repo>", got "${slug}"`)
  return { owner, repo }
}

const buildOctokit = async ({
  appId = process.env.GITHUB_APP_ID,
  privateKey = process.env.GITHUB_APP_PRIVATE_KEY,
  installationId = process.env.GITHUB_APP_INSTALLATION_ID,
  token = process.env.GITHUB_TOKEN,
} = {}) => {
  if (appId && privateKey && installationId) {
    const { Octokit } = require('@octokit/rest')
    const { createAppAuth } = require('@octokit/auth-app')
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(appId),
        privateKey: privateKey.replace(/\\n/g, '\n'),
        installationId: Number(installationId),
      },
    })
  }
  if (token) {
    const { Octokit } = require('@octokit/rest')
    return new Octokit({ auth: token })
  }
  throw new Error(
    'GitHub auth missing: set either GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID, or GITHUB_TOKEN',
  )
}

// Body assembly for triage issues. Keeps the shape stable so the agent
// workflow can parse it back out reliably. Sections:
//   - Sentry header (URL, issue id, runtime tag, release)
//   - ```json fenced event payload
//   - Prior attempts (one bullet per prior closed issue, with merged PRs)
const buildTriageIssueBody = (event, priorAttempts = []) => {
  const sentryId = event.issue?.id || event.data?.issue?.id || event.issueId
  const url = event.issue?.url || event.url || event.data?.issue?.url
  const runtime = event.runtime || event.event?.tags?.runtime
  const release = event.release || event.event?.release

  const lines = []
  lines.push('## Sentry')
  if (sentryId) lines.push(`- **Issue ID:** \`${sentryId}\``)
  if (url) lines.push(`- **Sentry URL:** ${url}`)
  if (runtime) lines.push(`- **Runtime:** \`${runtime}\``)
  if (release) lines.push(`- **Release:** \`${release}\``)

  lines.push('')
  lines.push('## Event payload')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(event, null, 2))
  lines.push('```')
  lines.push('')

  lines.push('## Prior attempts')
  if (!priorAttempts.length) {
    lines.push('_None._')
  } else {
    for (const attempt of priorAttempts) {
      const mergedPrs = (attempt.mergedPRs || []).map((pr) => `#${pr.number}`).join(', ')
      const suffix = mergedPrs ? ` — merged PR(s): ${mergedPrs}` : ''
      lines.push(`- Issue #${attempt.number} (closed ${attempt.closed_at || 'unknown'})${suffix}`)
    }
  }

  lines.push('')
  lines.push('```sentry-also-resolves')
  lines.push('```')

  return lines.join('\n')
}

const createDispatcher = async ({
  octokit,
  repo = process.env.GITHUB_REPO,
  ref = process.env.SENTRY_FIX_WORKFLOW_REF || DEFAULT_REF,
  workflowFile = FIX_WORKFLOW_FILE,
} = {}) => {
  const { owner, repo: repoName } = parseRepo(repo)
  const client = octokit || (await buildOctokit())

  const searchIssuesAndPRs = async (q) => {
    const result = await client.request('GET /search/issues', {
      q,
      per_page: 100,
    })
    return result.data?.items || []
  }

  const findOpenForSentryIssue = async (sentryId) => {
    const items = await searchIssuesAndPRs(`repo:${owner}/${repoName} is:open label:"${sentryLabel(sentryId)}"`)
    return items[0] || null
  }

  const findPriorAttempts = async (sentryId) => {
    const closedIssues = await searchIssuesAndPRs(
      `repo:${owner}/${repoName} type:issue is:closed label:"${sentryLabel(sentryId)}"`,
    )
    const out = []
    for (const issue of closedIssues) {
      const mergedPRs = []
      // Search PRs that share the label AND are merged. Cheap enough at our
      // event volume; avoids parsing comment timelines.
      const mergedSearch = await searchIssuesAndPRs(
        `repo:${owner}/${repoName} type:pr is:merged label:"${sentryLabel(sentryId)}"`,
      )
      for (const pr of mergedSearch) mergedPRs.push({ number: pr.number, url: pr.html_url })
      out.push({ number: issue.number, closed_at: issue.closed_at, mergedPRs })
    }
    return out
  }

  const hasWontFix = async (sentryId) => {
    const items = await searchIssuesAndPRs(
      `repo:${owner}/${repoName} label:"${sentryLabel(sentryId)}" label:"${WONT_FIX_LABEL}"`,
    )
    return items.length > 0
  }

  const countInFlightFixPRs = async () => {
    const items = await searchIssuesAndPRs(
      `repo:${owner}/${repoName} type:pr is:open label:"${SENTRY_FIX_LABEL}"`,
    )
    return items.length
  }

  const countTodayDispatches = async (now = new Date()) => {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const items = await searchIssuesAndPRs(
      `repo:${owner}/${repoName} type:issue label:"${SENTRY_FIX_LABEL}" created:>=${since}`,
    )
    return items.length
  }

  const createTriageIssue = async (event, priorAttempts = []) => {
    const sentryId = event.issue?.id || event.data?.issue?.id || event.issueId
    if (!sentryId) throw new Error('createTriageIssue: cannot derive sentryId from event')
    const title = event.issue?.title || event.data?.issue?.title || `[sentry:${sentryId}] Triage`
    const body = buildTriageIssueBody(event, priorAttempts)
    const labels = [sentryLabel(sentryId), SENTRY_FIX_LABEL]
    const response = await client.request('POST /repos/{owner}/{repo}/issues', {
      owner,
      repo: repoName,
      title,
      body,
      labels,
    })
    return { number: response.data.number, url: response.data.html_url, labels, body }
  }

  const triggerFixWorkflow = async (issueNumber) => {
    await client.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner,
      repo: repoName,
      workflow_id: workflowFile,
      ref,
      inputs: { issue_number: String(issueNumber) },
    })
  }

  return {
    findOpenForSentryIssue,
    findPriorAttempts,
    hasWontFix,
    countInFlightFixPRs,
    countTodayDispatches,
    createTriageIssue,
    triggerFixWorkflow,
  }
}

module.exports = {
  createDispatcher,
  buildTriageIssueBody,
  buildOctokit,
  parseRepo,
  sentryLabel,
  SENTRY_FIX_LABEL,
  WONT_FIX_LABEL,
  FIX_WORKFLOW_FILE,
}
