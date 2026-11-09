'use strict'

// Bandcamp cart-push: open one background tab per Fomo Player track,
// resolved to the Bandcamp track-page URL. There is no Bandcamp add-to-cart
// API the extension can drive; the user finishes the add in each opened tab.
//
// Batching: at run start we read `bandcampCartPushBatchSize` from storage.
//   - `null` (blank in Options): one batch containing everything.
//   - integer N > 0: ceil(queueLength / N) batches; the user advances with
//     `Open next batch` in the popup, which dispatches
//     `cart-push:open-next-batch` → `openNextBandcampBatch()`.

const { resolveCartTracks } = require('./resolve')
const {
  RunStatus,
  withRunLock,
  readRun,
  replaceRun,
  readBandcampBatchSize,
  newRunId,
  emptyResults,
} = require('./state')

const getBrowser = () => {
  if (typeof browser !== 'undefined') return browser
  if (typeof global !== 'undefined' && global.browser) return global.browser
  return require('../browser').default || require('../browser')
}

// Partition `queue` into batches of size `batchSize` (or one batch of
// everything when batchSize is null). Exported for testability.
const partitionIntoBatches = (queue, batchSize) => {
  if (queue.length === 0) return []
  if (batchSize === null || batchSize === undefined) return [queue.slice()]
  const out = []
  for (let i = 0; i < queue.length; i += batchSize) {
    out.push(queue.slice(i, i + batchSize))
  }
  return out
}

const openTabsForBatch = async (batch, deps = {}) => {
  const tabsApi = (deps.browser && deps.browser.tabs) || getBrowser().tabs
  const opened = []
  for (const track of batch) {
    try {
      await tabsApi.create({ url: track.url, active: false })
      opened.push(track)
    } catch (e) {
      console.warn('[cart-push:bandcamp] tabs.create failed for', track.url, e)
    }
  }
  return opened
}

const startBandcampRun = async ({ fomoplayerCartId }, deps = {}) => {
  return withRunLock(async () => {
    const resolved = await resolveCartTracks({ store: 'bandcamp', fomoplayerCartId }, deps)
    const batchSize = await readBandcampBatchSize()
    const batches = partitionIntoBatches(resolved.queue, batchSize)
    const results = emptyResults('bandcamp')
    for (const m of resolved.notOnStore) results.notOnStore.push(m)

    const now = new Date().toISOString()
    const batchCount = batches.length

    if (batchCount === 0) {
      // Queue resolved empty (only notOnStore entries).
      const run = {
        runId: newRunId(),
        store: 'bandcamp',
        fomoplayerCartId,
        fomoplayerCartName: resolved.cartName || '',
        status: RunStatus.COMPLETED,
        startedAt: now,
        completedAt: now,
        queue: [],
        batches: [],
        batchSize,
        batchIndex: 0,
        batchCount: 0,
        results,
      }
      await replaceRun(run)
      return { ok: true, run }
    }

    const initial = {
      runId: newRunId(),
      store: 'bandcamp',
      fomoplayerCartId,
      fomoplayerCartName: resolved.cartName || '',
      status: RunStatus.RUNNING,
      startedAt: now,
      completedAt: null,
      queue: resolved.queue,
      batches,
      batchSize,
      batchIndex: 0,
      batchCount,
      results,
    }
    await replaceRun(initial)

    const opened = await openTabsForBatch(batches[0], deps)
    const nextResults = { ...initial.results, added: [...initial.results.added, ...opened] }
    const isLastBatch = batchCount === 1
    const after = {
      ...initial,
      results: nextResults,
      status: isLastBatch ? RunStatus.COMPLETED : RunStatus.AWAITING_NEXT_BATCH,
      completedAt: isLastBatch ? new Date().toISOString() : null,
    }
    await replaceRun(after)
    return { ok: true }
  })
}

const openNextBandcampBatch = async (deps = {}) => {
  const run = await readRun()
  if (!run) return { ok: false, error: 'No active run' }
  if (run.store !== 'bandcamp') return { ok: false, error: 'Active run is not Bandcamp' }
  if (run.status !== RunStatus.AWAITING_NEXT_BATCH) {
    return { ok: false, error: `Run is not awaiting next batch (status=${run.status})` }
  }
  const nextIndex = run.batchIndex + 1
  if (nextIndex >= run.batchCount) {
    // Defensive: shouldn't happen — last batch should already have flipped
    // to `completed`. Treat as a no-op idempotent terminator.
    const finished = { ...run, status: RunStatus.COMPLETED, completedAt: new Date().toISOString() }
    await replaceRun(finished)
    return { ok: true }
  }
  const batch = run.batches[nextIndex]
  const opened = await openTabsForBatch(batch, deps)
  const isLast = nextIndex + 1 === run.batchCount
  const nextResults = { ...run.results, added: [...run.results.added, ...opened] }
  const after = {
    ...run,
    batchIndex: nextIndex,
    results: nextResults,
    status: isLast ? RunStatus.COMPLETED : RunStatus.AWAITING_NEXT_BATCH,
    completedAt: isLast ? new Date().toISOString() : null,
  }
  await replaceRun(after)
  return { ok: true }
}

module.exports = {
  partitionIntoBatches,
  startBandcampRun,
  openNextBandcampBatch,
}
