// Seeding for the follow-suggestions demo tests.
//
// Follow suggestions are derived from the artists and labels behind the tracks
// in the user's *purchased* cart. The real ingestion path for purchased tracks
// is `POST /api/me/purchased` (the same endpoint the Chrome extension hits when
// a purchase is detected), so we seed through it. Driving it via a browser-side
// fetch means the request carries the logged-in session cookie and works
// identically against the local backend and the remote Railway preview — no DB
// access required, so the local and preview demo tests share this code.

const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')

const fixtures = [
  require('../fixtures/noisia_concussion_beatport.json'),
  require('../fixtures/noisia_purpose_beatport.json'),
  require('../fixtures/noisia_purpose_remix_beatport.json'),
  require('../fixtures/beatport_operator_track_pageprops.json'),
  require('../fixtures/beatport_dub_power_track_pageprops.json'),
  require('../fixtures/noisia_block_control_beatport.json'),
]

// The extension stamps each purchased track with the time it was bought; the
// purchased-cart ingestion requires it (track__cart_added is NOT NULL), so we
// add a fixed timestamp here rather than leaving it undefined.
const PURCHASED_AT = '2024-01-01T00:00:00.000Z'
const purchasedTracks = fixtures
  .flatMap((fixture) => beatportTracksTransform(fixture))
  .map((track) => ({ ...track, purchased: PURCHASED_AT }))

const fetchViaBrowser = (page, path, { method = 'GET', body, headers } = {}) =>
  page.evaluate(
    async ({ path, method, body, headers }) => {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      return { status: res.status, text }
    },
    { path, method, body, headers },
  )

module.exports.fetchViaBrowser = fetchViaBrowser
module.exports.purchasedTrackCount = purchasedTracks.length

// Idempotent: the purchased-cart insert does ON CONFLICT DO NOTHING, so running
// this twice against the persistent preview is a no-op.
module.exports.seedPurchasedViaApi = async (page) => {
  const res = await fetchViaBrowser(page, '/api/me/purchased', {
    method: 'POST',
    body: purchasedTracks,
    headers: { 'x-multi-store-player-store': beatportUrl },
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Seeding purchased tracks failed: HTTP ${res.status} — ${res.text}`)
  }
}

// Undo a dismissal so the preview keeps a full set of suggestions for the next
// re-run (the demo dismisses one suggestion, then restores it here).
module.exports.restoreSuggestionViaApi = async (page, type, id) => {
  const res = await fetchViaBrowser(page, `/api/me/follows/suggestions/ignores/${type}/${id}`, { method: 'DELETE' })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Restoring suggestion failed: HTTP ${res.status} — ${res.text}`)
  }
}
