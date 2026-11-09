/**
 * The watch job runner decides, per followed entity, whether a failure ends
 * the run. A rate limit does (every further request would be rejected), a
 * single other failure does not (it is that entity's problem, so the entity is
 * postponed and the run continues), and several failures in a row do (the
 * store is likely down). These tests drive the runner with stub updates.
 */
const assert = require('assert')
const { test } = require('cascade-test')

const { runEntityFetches, fetchJobs, CONSECUTIVE_FAILURE_LIMIT } = require('../../../../jobs/watches/shared/logic')

const deps = { insertSource: async () => 1, updateSourceDetails: async () => {} }
const entities = (n) => Array.from({ length: n }, (_, i) => ({ id: i, url: `https://e${i}.example` }))
const rateLimitError = (retryAfter = new Date('2026-11-02T10:00:00Z')) => [
  'Rate limited while fetching artist tracks',
  { isRateLimit: true, requestCount: 7, retryAfter },
]
const failure = (id) => [`fetch failed for ${id}`, new Error('boom')]

const run = async ({ outcomes, count }) => {
  const updated = []
  const failed = []
  const result = await runEntityFetches(
    {
      kind: { singular: 'artist', plural: 'artists' },
      storeUrl: 'https://bandcamp.com',
      jobDetails: {},
      entities: entities(count),
      describe: (d) => d.url,
      update: async (_store, details) => {
        updated.push(details.id)
        const outcome = outcomes[details.id]
        if (outcome instanceof Error) throw outcome
        return outcome || []
      },
      recordFailure: async (details) => failed.push(details.id),
      recordMetrics: true,
    },
    deps,
  )
  return { result, updated, failed }
}

test({
  'a single failure postpones that entity and the run continues': async () => {
    const { result, updated, failed } = await run({ count: 4, outcomes: { 1: [failure(1)] } })
    assert.deepStrictEqual(updated, [0, 1, 2, 3])
    assert.deepStrictEqual(failed, [1])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.rateLimited, null)
    assert.strictEqual(result.stoppedAfterFailures, false)
  },

  'a thrown error is handled like a returned one': async () => {
    const { updated, failed, result } = await run({ count: 3, outcomes: { 0: new Error('network down') } })
    assert.deepStrictEqual(updated, [0, 1, 2])
    assert.deepStrictEqual(failed, [0])
    assert.match(result.errors[0][0], /network down/)
  },

  'a rate limit stops the run, is not an error and does not postpone the entity': async () => {
    const retryAfter = new Date('2026-11-02T10:00:00Z')
    const { result, updated, failed } = await run({ count: 5, outcomes: { 2: [rateLimitError(retryAfter)] } })
    assert.deepStrictEqual(updated, [0, 1, 2])
    assert.deepStrictEqual(failed, [])
    assert.deepStrictEqual(result.errors, [])
    assert.deepStrictEqual(result.rateLimited, { retryAfter, requestCount: 7 })
  },

  'a thrown rate limit stops the run too': async () => {
    const e = Object.assign(new Error('paused'), { isRateLimit: true, isSuspended: true })
    const { result, updated } = await run({ count: 3, outcomes: { 0: e } })
    assert.deepStrictEqual(updated, [0])
    assert.ok(result.rateLimited)
    assert.deepStrictEqual(result.errors, [])
  },

  'failures in a row stop the run; a success in between resets the count': async () => {
    const stopped = await run({
      count: 6,
      outcomes: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, [failure(i)]])),
    })
    assert.deepStrictEqual(stopped.updated, Array.from({ length: CONSECUTIVE_FAILURE_LIMIT }, (_, i) => i))
    assert.strictEqual(stopped.result.stoppedAfterFailures, true)

    const interleaved = await run({ count: 6, outcomes: { 0: [failure(0)], 1: [failure(1)], 3: [failure(3)], 4: [failure(4)] } })
    assert.deepStrictEqual(interleaved.updated, [0, 1, 2, 3, 4, 5])
    assert.strictEqual(interleaved.result.stoppedAfterFailures, false)
  },

  'fetchJobs skips the remaining entity kinds after a rate limit and still succeeds': async () => {
    const calls = []
    const job = (name, res) => async () => {
      calls.push(name)
      return { errors: [], processed: 1, total: 1, stoppedAfterFailures: false, rateLimited: null, ...res }
    }
    const res = await fetchJobs({
      artist: job('artist', { rateLimited: { retryAfter: null, requestCount: 3 } }),
      label: job('label'),
      playlist: job('playlist'),
    })(1)
    assert.deepStrictEqual(calls, ['artist'])
    assert.strictEqual(res.success, true)
    assert.deepStrictEqual(res.result.rateLimited, { retryAfter: null, requestCount: 3 })
    assert.deepStrictEqual(res.result.runs.label, { skipped: 'rate limited' })
  },

  'fetchJobs fails when fetches failed': async () => {
    const res = await fetchJobs({
      artist: async () => ({ errors: [failure(1)], processed: 2, total: 2, stoppedAfterFailures: false, rateLimited: null }),
    })(1)
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.result.errors.length, 1)
  },
})
