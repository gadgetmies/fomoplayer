'use strict'

// Beatport cart-push: one-way incremental sync of a Fomo Player cart's
// tracks into a Beatport cart named `FOMO: <fomoplayer cart name>`.
//
// All HTTP calls run from the service worker; the worker holds the
// `https://*.beatport.com/*` host permission. The bearer token is sourced
// from `www.beatport.com/api/auth/session` (the same flow Beatport's own
// SPA uses).
//
// The run-state object is persisted to `browser.storage.local.cartPushRun`
// after every individual POST so the loop is resumable across MV3 worker
// idle / restart. `runBeatportLoop` is intentionally re-entrant — a second
// invocation while a loop is already running becomes a no-op via a
// process-local flag, and a wake-up after idle re-reads `processed` and
// continues from `queue[processed]`.

const { resolveCartTracks } = require('./resolve')
const { RunStatus, isTerminal, withRunLock, readRun, replaceRun, newRunId, emptyResults } = require('./state')

const SESSION_URL = 'https://www.beatport.com/api/auth/session'
const API_BASE = 'https://api.beatport.com/v4'
const BEATPORT_CART_PREFIX = 'FOMO: '

const realFetch = (...args) => fetch(...args)

const safeJson = async (response, label) => {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  if (!contentType.includes('application/json')) {
    console.warn(
      `[cart-push:beatport] ${label}: non-JSON response`,
      'status=',
      response.status,
      'content-type=',
      contentType,
      'body=',
      text.slice(0, 2000),
    )
    return null
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    console.warn(
      `[cart-push:beatport] ${label}: JSON.parse failed`,
      'status=',
      response.status,
      'body=',
      text.slice(0, 2000),
    )
    return null
  }
}

const fetchBeatportAccessToken = async (deps = {}) => {
  const fetchFn = deps.fetch || realFetch
  const response = await fetchFn(SESSION_URL, { credentials: 'include' })
  if (!response.ok) return null
  const body = await safeJson(response, 'auth/session')
  return body?.token?.accessToken || null
}

const bearerHeaders = (bearer) => ({
  Authorization: `Bearer ${bearer}`,
  'Content-Type': 'application/json',
})

const listBeatportCarts = async (bearer, deps = {}) => {
  const fetchFn = deps.fetch || realFetch
  const response = await fetchFn(`${API_BASE}/my/carts/`, { headers: bearerHeaders(bearer) })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`listBeatportCarts failed: ${response.status} ${text.slice(0, 500)}`)
  }
  const body = await safeJson(response, 'my/carts list')
  if (!body) throw new Error('listBeatportCarts: non-JSON response')
  if (Array.isArray(body)) return body
  if (Array.isArray(body.results)) return body.results
  if (Array.isArray(body.carts)) return body.carts
  return []
}

const createBeatportCart = async (name, bearer, deps = {}) => {
  const fetchFn = deps.fetch || realFetch
  const response = await fetchFn(`${API_BASE}/my/carts/`, {
    method: 'POST',
    headers: bearerHeaders(bearer),
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: text.slice(0, 500) }
  }
  const body = await safeJson(response, 'my/carts create')
  return { ok: true, cart: body }
}

const collectItemIds = (rawItems) => {
  const out = new Set()
  if (!Array.isArray(rawItems)) return out
  for (const item of rawItems) {
    if (!item) continue
    // The shape that `items` actually takes is undocumented. Defensively
    // scan likely field locations until we find an integer-looking id.
    const candidates = [
      item.item_id,
      item.itemId,
      item.id,
      item.track_id,
      item.trackId,
      item?.track?.id,
      item?.item?.id,
    ]
    for (const c of candidates) {
      const n = Number(c)
      if (Number.isInteger(n) && n > 0) {
        out.add(n)
        break
      }
    }
  }
  return out
}

const getBeatportCartItemIds = async (cartId, bearer, deps = {}) => {
  const fetchFn = deps.fetch || realFetch
  const probeUrl = `${API_BASE}/my/carts/${cartId}/?items=true`
  const response = await fetchFn(probeUrl, { headers: bearerHeaders(bearer) })
  if (response.ok) {
    const body = await safeJson(response, `cart ${cartId} probe`)
    const itemsField = body?.items || body?.results || body?.cart_items
    if (Array.isArray(itemsField)) {
      return collectItemIds(itemsField)
    }
  }
  // Fallback: dedicated items collection endpoint.
  const fallbackUrl = `${API_BASE}/my/carts/${cartId}/items/`
  const fallback = await fetchFn(fallbackUrl, { headers: bearerHeaders(bearer) })
  if (!fallback.ok) {
    const text = await fallback.text().catch(() => '')
    console.warn(
      `[cart-push:beatport] getBeatportCartItemIds fallback failed: ${fallback.status} ${text.slice(0, 500)}`,
    )
    return new Set()
  }
  const fallbackBody = await safeJson(fallback, `cart ${cartId} items`)
  const fallbackItems = fallbackBody?.results || fallbackBody?.items || fallbackBody
  return collectItemIds(fallbackItems)
}

const postBeatportCartItem = async (cartId, itemId, bearer, deps = {}) => {
  const fetchFn = deps.fetch || realFetch
  const response = await fetchFn(`${API_BASE}/my/carts/${cartId}/items/`, {
    method: 'POST',
    headers: bearerHeaders(bearer),
    body: JSON.stringify({
      item_id: itemId,
      item_type_id: 1,
      audio_format_id: 1,
      purchase_type_id: 1,
      source_type_id: 6,
    }),
  })
  if (response.ok) return { ok: true }
  const text = await response.text().catch(() => '')
  return { ok: false, status: response.status, error: text.slice(0, 500) }
}

// Progress reporting is best-effort: the cart-push modules are also driven
// by unit tests that don't wire `setStatus`/`clearStatus` through `deps`.
// Skip when missing rather than blow up.
const callDep = async (deps, name, ...args) => {
  try {
    if (typeof deps?.[name] === 'function') {
      await deps[name](...args)
    }
  } catch (_) {}
}

// The Status panel is the only place the user sees cart-push progress, so the
// label carries what the in-panel line used to: which Beatport cart is being
// filled, and how far along the queue we are.
const progressLabel = (beatportCartName, processed, total) =>
  `Pushing "${beatportCartName}" \u2014 ${processed} / ${total}`

const reportProgress = (deps, label, percent) => callDep(deps, 'setStatus', label, percent)

const reportDone = (deps) => callDep(deps, 'clearStatus')

const writeFailedRun = async ({ fomoplayerCartId, fomoplayerCartName, error }) => {
  const now = new Date().toISOString()
  const run = {
    runId: newRunId(),
    store: 'beatport',
    fomoplayerCartId,
    fomoplayerCartName,
    status: RunStatus.FAILED,
    startedAt: now,
    completedAt: now,
    queue: [],
    processed: 0,
    results: emptyResults('beatport'),
    error,
  }
  await replaceRun(run)
  return run
}

const startBeatportRun = async ({ fomoplayerCartId }, deps = {}) => {
  return withRunLock(async () => {
    const bearer = await fetchBeatportAccessToken(deps)
    if (!bearer) {
      const run = await writeFailedRun({
        fomoplayerCartId,
        fomoplayerCartName: '',
        error: 'Not logged in to Beatport',
      })
      await reportDone(deps)
      return { ok: false, error: run.error }
    }

    const resolved = await resolveCartTracks({ store: 'beatport', fomoplayerCartId }, deps)
    const cartName = resolved.cartName || ''
    const beatportCartName = `${BEATPORT_CART_PREFIX}${cartName}`

    let carts
    try {
      carts = await listBeatportCarts(bearer, deps)
    } catch (e) {
      const run = await writeFailedRun({
        fomoplayerCartId,
        fomoplayerCartName: cartName,
        error: e?.message || 'Could not list Beatport carts',
      })
      await reportDone(deps)
      return { ok: false, error: run.error }
    }

    let beatportCart = (carts || []).find((c) => c && c.name === beatportCartName)
    if (!beatportCart) {
      const created = await createBeatportCart(beatportCartName, bearer, deps)
      if (!created.ok) {
        const run = await writeFailedRun({
          fomoplayerCartId,
          fomoplayerCartName: cartName,
          error: `Could not create FOMO cart on Beatport — create a cart named '${beatportCartName}' on Beatport and re-run`,
        })
        await reportDone(deps)
        return { ok: false, error: run.error }
      }
      beatportCart = created.cart
    }

    const existingItemIds = await getBeatportCartItemIds(beatportCart.id, bearer, deps)
    const results = emptyResults('beatport')
    const queue = []
    for (const track of resolved.queue) {
      if (existingItemIds.has(track.itemId)) {
        results.alreadyInCart.push(track)
      } else {
        queue.push(track)
      }
    }
    for (const m of resolved.notOnStore) {
      results.notOnStore.push(m)
    }

    const now = new Date().toISOString()
    const run = {
      runId: newRunId(),
      store: 'beatport',
      fomoplayerCartId,
      fomoplayerCartName: cartName,
      beatportCartId: beatportCart.id,
      beatportCartName,
      status: queue.length === 0 ? RunStatus.COMPLETED : RunStatus.RUNNING,
      startedAt: now,
      completedAt: queue.length === 0 ? now : null,
      queue,
      processed: 0,
      results,
    }
    await replaceRun(run)
    if (queue.length === 0) {
      await reportDone(deps)
      return { ok: true, run }
    }
    await reportProgress(deps, progressLabel(beatportCartName, 0, queue.length), 0)
    await runBeatportLoop(deps)
    return { ok: true }
  })
}

// Process-local guard so a duplicate `runBeatportLoop` invocation (e.g.
// resume firing while an in-process loop is already advancing) is a no-op.
// The persisted `processed` index is the source of truth across worker
// restarts; this flag only protects within a single worker lifetime.
let loopInFlight = false

const runBeatportLoop = async (deps = {}) => {
  if (loopInFlight) return
  loopInFlight = true
  try {
    let run = await readRun()
    while (run && run.store === 'beatport' && run.status === RunStatus.RUNNING && run.processed < run.queue.length) {
      const track = run.queue[run.processed]
      const bearer = await fetchBeatportAccessToken(deps)
      if (!bearer) {
        run = {
          ...run,
          status: RunStatus.FAILED,
          completedAt: new Date().toISOString(),
          error: 'Not logged in to Beatport',
        }
        await replaceRun(run)
        // `break`, not `return`: the terminal-state check below owns clearing
        // the Status panel, and a `return` here skipped it.
        break
      }
      const result = await postBeatportCartItem(run.beatportCartId, track.itemId, bearer, deps)
      const nextResults = {
        ...run.results,
        added: result.ok ? [...run.results.added, track] : run.results.added,
        failed: result.ok
          ? run.results.failed
          : [...run.results.failed, { ...track, status: result.status, error: result.error }],
      }
      run = { ...run, results: nextResults, processed: run.processed + 1 }
      await replaceRun(run)
      const percent = Math.min(100, Math.round((run.processed / run.queue.length) * 100))
      await reportProgress(deps, progressLabel(run.beatportCartName, run.processed, run.queue.length), percent)
    }
    if (run && run.store === 'beatport' && run.status === RunStatus.RUNNING && run.processed >= run.queue.length) {
      run = { ...run, status: RunStatus.COMPLETED, completedAt: new Date().toISOString() }
      await replaceRun(run)
    }
    // Any terminal state for *this* worker's loop means progress should
    // stop being advertised — clears both completion and the auth-failure
    // FAILED branch above.
    if (run && isTerminal(run.status)) {
      await reportDone(deps)
    }
  } finally {
    loopInFlight = false
  }
}

const resumeBeatportRun = async (deps = {}) => {
  const run = await readRun()
  if (!run) return
  if (run.store !== 'beatport') return
  if (run.status !== RunStatus.RUNNING) return
  await runBeatportLoop(deps)
}

const __resetLoopGuardForTests = () => {
  loopInFlight = false
}

module.exports = {
  fetchBeatportAccessToken,
  listBeatportCarts,
  createBeatportCart,
  getBeatportCartItemIds,
  postBeatportCartItem,
  startBeatportRun,
  runBeatportLoop,
  resumeBeatportRun,
  __resetLoopGuardForTests,
}
