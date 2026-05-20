'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const {
  createDispatcher,
  buildTriageIssueBody,
  parseRepo,
  sentryLabel,
  SENTRY_FIX_LABEL,
} = require('../../../services/github-dispatch')

const stubOctokit = ({ search = {}, createIssue, dispatch } = {}) => {
  const calls = { search: [], createIssue: [], dispatch: [] }
  const client = {
    request: async (route, params = {}) => {
      if (route === 'GET /search/issues') {
        calls.search.push(params.q)
        const items = search[params.q] || []
        return { data: { total_count: items.length, items } }
      }
      if (route === 'POST /repos/{owner}/{repo}/issues') {
        calls.createIssue.push(params)
        const data = createIssue ? createIssue(params) : { number: 42, html_url: `https://github.com/${params.owner}/${params.repo}/issues/42` }
        return { data }
      }
      if (route === 'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches') {
        calls.dispatch.push(params)
        if (dispatch) dispatch(params)
        return { data: undefined }
      }
      throw new Error(`stubOctokit: unhandled route "${route}"`)
    },
  }
  return { client, calls }
}

const makeEvent = (overrides = {}) => ({
  action: 'created',
  issue: { id: 'ABC', title: 'Boom', url: 'https://sentry.io/issues/ABC', count: 100 },
  runtime: 'back',
  release: 'back@1.0.0',
  ...overrides,
})

test({
  'parseRepo': {
    'splits owner/repo': () => {
      assert.deepEqual(parseRepo('octo/cat'), { owner: 'octo', repo: 'cat' })
    },
    'throws on missing slug': () => {
      assert.throws(() => parseRepo(undefined), /GITHUB_REPO/)
      assert.throws(() => parseRepo('only-one-part'), /GITHUB_REPO/)
    },
  },

  'sentryLabel': {
    'prefixes id with "sentry:"': () => {
      assert.equal(sentryLabel('ABC'), 'sentry:ABC')
    },
  },

  'buildTriageIssueBody': {
    'includes Sentry header, JSON event, and prior attempts': () => {
      const body = buildTriageIssueBody(
        makeEvent(),
        [{ number: 7, closed_at: '2026-05-01', mergedPRs: [{ number: 8 }] }],
      )
      assert.ok(body.includes('**Issue ID:** `ABC`'))
      assert.ok(body.includes('**Sentry URL:** https://sentry.io/issues/ABC'))
      assert.ok(body.includes('**Runtime:** `back`'))
      assert.ok(body.includes('**Release:** `back@1.0.0`'))
      assert.ok(body.includes('```json'))
      assert.ok(body.includes('"Boom"'))
      assert.ok(body.includes('Issue #7 (closed 2026-05-01) — merged PR(s): #8'))
      assert.ok(body.includes('```sentry-also-resolves'))
    },
    'shows "None." when there are no prior attempts': () => {
      const body = buildTriageIssueBody(makeEvent(), [])
      assert.ok(body.includes('## Prior attempts\n_None._'))
    },
  },

  'dispatcher with stubbed Octokit': {
    setup: async () => {
      const search = {
        // findOpenForSentryIssue
        'repo:octo/cat is:open label:"sentry:ABC"': [{ number: 5, html_url: 'https://github.com/octo/cat/issues/5' }],
        // findOpenForSentryIssue (no match)
        'repo:octo/cat is:open label:"sentry:NOPE"': [],
        // findPriorAttempts: closed issues
        'repo:octo/cat type:issue is:closed label:"sentry:ABC"': [
          { number: 9, closed_at: '2026-05-01T00:00:00Z' },
        ],
        // findPriorAttempts: merged PRs for that label
        'repo:octo/cat type:pr is:merged label:"sentry:ABC"': [
          { number: 10, html_url: 'https://github.com/octo/cat/pull/10' },
        ],
        // hasWontFix
        'repo:octo/cat label:"sentry:WF" label:"wont-fix"': [{ number: 11 }],
        'repo:octo/cat label:"sentry:OK" label:"wont-fix"': [],
        // counts
        'repo:octo/cat type:pr is:open label:"sentry-fix"': [{ number: 1 }, { number: 2 }],
      }
      return { search }
    },

    'findOpenForSentryIssue returns first item, or null': async ({ search }) => {
      const { client } = stubOctokit({ search })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      const hit = await d.findOpenForSentryIssue('ABC')
      assert.equal(hit.number, 5)
      const miss = await d.findOpenForSentryIssue('NOPE')
      assert.equal(miss, null)
    },

    'findPriorAttempts pairs closed issues with merged PRs': async ({ search }) => {
      const { client } = stubOctokit({ search })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      const attempts = await d.findPriorAttempts('ABC')
      assert.equal(attempts.length, 1)
      assert.equal(attempts[0].number, 9)
      assert.deepEqual(attempts[0].mergedPRs, [{ number: 10, url: 'https://github.com/octo/cat/pull/10' }])
    },

    'hasWontFix true / false': async ({ search }) => {
      const { client } = stubOctokit({ search })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      assert.equal(await d.hasWontFix('WF'), true)
      assert.equal(await d.hasWontFix('OK'), false)
    },

    'countInFlightFixPRs returns search item count': async ({ search }) => {
      const { client } = stubOctokit({ search })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      assert.equal(await d.countInFlightFixPRs(), 2)
    },

    'countTodayDispatches uses a 24h created-since clause': async () => {
      const { client, calls } = stubOctokit({ search: {} })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      const fixedNow = new Date('2026-05-19T12:00:00Z')
      await d.countTodayDispatches(fixedNow)
      const q = calls.search[0]
      assert.ok(q.includes('label:"sentry-fix"'))
      assert.ok(q.includes('created:>=2026-05-18T12:00:00.000Z'), `unexpected query: ${q}`)
    },

    'createTriageIssue posts labels and body containing prior attempts': async () => {
      const { client, calls } = stubOctokit({
        createIssue: () => ({ number: 77, html_url: 'https://github.com/octo/cat/issues/77' }),
      })
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      const result = await d.createTriageIssue(makeEvent(), [
        { number: 5, closed_at: '2026-05-01', mergedPRs: [{ number: 6 }] },
      ])
      assert.equal(result.number, 77)
      assert.deepEqual(calls.createIssue[0].labels, ['sentry:ABC', 'sentry-fix'])
      assert.ok(calls.createIssue[0].body.includes('Issue #5 (closed 2026-05-01) — merged PR(s): #6'))
    },

    'createTriageIssue throws when sentryId cannot be derived': async () => {
      const { client } = stubOctokit({})
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      await assert.rejects(d.createTriageIssue({}, []), /cannot derive sentryId/)
    },

    'triggerFixWorkflow dispatches sentry-fix.yml against master with issue_number input': async () => {
      const { client, calls } = stubOctokit({})
      const d = await createDispatcher({ octokit: client, repo: 'octo/cat' })
      await d.triggerFixWorkflow(99)
      assert.equal(calls.dispatch.length, 1)
      assert.equal(calls.dispatch[0].workflow_id, 'sentry-fix.yml')
      assert.equal(calls.dispatch[0].ref, 'master')
      assert.deepEqual(calls.dispatch[0].inputs, { issue_number: '99' })
    },

    'SENTRY_FIX_LABEL export is stable': () => {
      assert.equal(SENTRY_FIX_LABEL, 'sentry-fix')
    },
  },
})
