// Shared by the Beatport backfill scripts: re-fetches stored tracks from the v4 API in batches, with retries and a
// per-track fallback.

const BPromise = require('bluebird')
const bpApi = require('../../routes/stores/beatport/bp-api')

// Kept low so the per-track fallback stays well clear of Beatport's rate limit.
const MAX_PARALLEL_FETCHES = 6

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Beatport rate-limits bursts with 429; back off rather than abort the run.
const withRetry = async (fn, log, attempt = 1) => {
  try {
    return await fn()
  } catch (e) {
    if (/\((429|5\d\d)\)/.test(e.message) && attempt <= 5) {
      const delay = 2 ** attempt * 1000
      log(`  API error (${e.message.slice(0, 60)}), retrying in ${delay / 1000}s`)
      await sleep(delay)
      return withRetry(fn, log, attempt + 1)
    }
    throw e
  }
}

// Fetches the raw v4 track objects for the given Beatport ids, keyed by id.
// Uses the id-filtered collection and falls back to per-track requests for
// any id the batch did not return (and for everything if batching turns out
// not to filter at all).
const fetchTracks = async (storeTrackIds, state, log) => {
  const byId = new Map()
  if (state.batchingWorks && storeTrackIds.length > 1) {
    const results = await withRetry(() => bpApi.getTracksByIds(storeTrackIds), log)
    for (const track of results ?? []) {
      if (storeTrackIds.includes(String(track.id))) byId.set(String(track.id), track)
    }
    if (byId.size === 0 && (results ?? []).length > 0) {
      log('  The v4 id filter returned unrelated tracks; switching to per-track requests')
      state.batchingWorks = false
    }
  }

  await BPromise.map(
    storeTrackIds.filter((id) => !byId.has(id)),
    async (id) => {
      try {
        byId.set(id, await withRetry(() => bpApi.getTrack(id), log))
      } catch (e) {
        // 404: removed from the catalog. 403 "Territory Restricted": not
        // licensed in the account's region. Both are simply unavailable; any
        // other failure is logged and the track is left for a later run.
        if (!/\((403|404)\)/.test(e.message)) log(`  bp ${id} fetch failed: ${e.message.slice(0, 120)}`)
      }
    },
    { concurrency: MAX_PARALLEL_FETCHES },
  )
  return byId
}

module.exports = { fetchTracks }
