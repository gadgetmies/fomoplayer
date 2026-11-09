'use strict'

// `browser` is a runtime dependency, but the unit tests stub it on
// `globalThis` before requiring this module. In webpack-built code the
// shim resolves to `webextension-polyfill` via the `../browser` module.
const getBrowser = () => {
  if (typeof browser !== 'undefined') return browser
  if (typeof global !== 'undefined' && global.browser) return global.browser
  // Lazy require so test stubs win even when this module is required first.
  return require('../browser').default || require('../browser')
}

const CART_PUSH_RUN_KEY = 'cartPushRun'
const BANDCAMP_BATCH_SIZE_KEY = 'bandcampCartPushBatchSize'

const RunStatus = Object.freeze({
  RUNNING: 'running',
  AWAITING_NEXT_BATCH: 'awaiting-next-batch',
  COMPLETED: 'completed',
  FAILED: 'failed',
})

const Bucket = Object.freeze({
  ADDED: 'added',
  ALREADY_IN_CART: 'alreadyInCart',
  NOT_ON_STORE: 'notOnStore',
  FAILED: 'failed',
})

const TERMINAL_STATUSES = new Set([RunStatus.COMPLETED, RunStatus.FAILED])

const isTerminal = (status) => TERMINAL_STATUSES.has(status)

const readRun = async () => {
  const stored = await getBrowser().storage.local.get(CART_PUSH_RUN_KEY)
  return stored?.[CART_PUSH_RUN_KEY] || null
}

const writeRun = async (partial) => {
  const existing = (await readRun()) || {}
  const next = { ...existing, ...partial }
  await getBrowser().storage.local.set({ [CART_PUSH_RUN_KEY]: next })
  return next
}

const replaceRun = async (run) => {
  await getBrowser().storage.local.set({ [CART_PUSH_RUN_KEY]: run })
  return run
}

const clearRun = async () => {
  await getBrowser().storage.local.remove(CART_PUSH_RUN_KEY)
}

// Run-lock — invokes `fn` only when no non-terminal run exists. Returns
// `{ ok: false, error }` when a run is already in flight so the worker
// can surface the conflict.
const withRunLock = async (fn) => {
  const existing = await readRun()
  if (existing && !isTerminal(existing.status)) {
    return {
      ok: false,
      error: `A ${existing.store} push is in progress — wait or dismiss it before starting another`,
      conflictingStore: existing.store,
    }
  }
  return fn()
}

const readBandcampBatchSize = async () => {
  const stored = await getBrowser().storage.local.get(BANDCAMP_BATCH_SIZE_KEY)
  const value = stored?.[BANDCAMP_BATCH_SIZE_KEY]
  if (value === null) return null
  if (value === undefined) return 10
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : 10
}

const writeBandcampBatchSize = async (value) => {
  await getBrowser().storage.local.set({ [BANDCAMP_BATCH_SIZE_KEY]: value })
}

const emptyResults = (store) => ({
  added: [],
  alreadyInCart: store === 'beatport' ? [] : undefined,
  notOnStore: [],
  failed: [],
})

const newRunId = () =>
  `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

module.exports = {
  CART_PUSH_RUN_KEY,
  BANDCAMP_BATCH_SIZE_KEY,
  RunStatus,
  Bucket,
  isTerminal,
  readRun,
  writeRun,
  replaceRun,
  clearRun,
  withRunLock,
  readBandcampBatchSize,
  writeBandcampBatchSize,
  emptyResults,
  newRunId,
}
