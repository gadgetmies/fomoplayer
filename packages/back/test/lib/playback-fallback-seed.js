const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const concussionFixture = require('../fixtures/noisia_concussion_beatport.json')

// Two Beatport tracks for the playback fallback demo, built from the Concussion fixture. Their store ids, release
// titles, catalog numbers and titles are unique and the ISRC is dropped so the backend does not merge them into the seeded
// Concussion track.
//   - The fallback track has a broken 30 s preview and the working 120 s sample. The player tries the shorter
//     preview first, so it has to fall back to the sample.
//   - The broken track has only the broken preview, so the player has to skip it and flag the row.
// The test makes the broken preview URLs fail with page.route, so neither environment depends on how that URL
// actually responds.
const [concussion] = beatportTracksTransform(concussionFixture)
const { isrc, store_details, ...concussionWithoutIsrc } = concussion
const [workingPreview] = concussion.previews

// Each track needs its own broken URL: tracks that share a preview URL are merged into one.
const BROKEN_PREVIEW_URL_PATTERN = '**/fomoplayer-playback-demo-broken-*.LOFI.mp3'
const WORKING_PREVIEW_URL = workingPreview.url
const brokenPreview = (id) => ({
  format: 'mp3',
  url: `https://geo-samples.beatport.com/track/fomoplayer-playback-demo-broken-${id}.LOFI.mp3`,
  start_ms: 0,
  end_ms: 30000,
})

const FALLBACK_TRACK_TITLE = 'Concussion (Playback Fallback Demo)'
const BROKEN_TRACK_TITLE = 'Concussion (Playback Failure Demo)'

const demoTrack = (id, title, extraPreviews) => ({
  ...concussionWithoutIsrc,
  id,
  title,
  previews: [brokenPreview(id), ...extraPreviews],
  url: `https://www.beatport.com/track/concussion-playback-demo/${id}`,
  release: {
    ...concussion.release,
    id,
    title: title,
    catalog_number: `FOMO-PLAYBACK-DEMO-${id}`,
    url: `https://www.beatport.com/release/playback-demo/${id}`,
  },
})

// Seeded one at a time with the broken track last, so it is the newest in the recent list and the player has a
// track to skip to after it.
const playbackDemoTracks = [
  demoTrack('990000101', FALLBACK_TRACK_TITLE, [workingPreview]),
  demoTrack('990000102', BROKEN_TRACK_TITLE, []),
]

// Same endpoint the browser extension uses; adding the same store track again is an upsert, so re-runs against
// the persistent preview are safe. skipOld=false because the fixture was published in 2005.
const seedPlaybackDemoTrackViaApi = async (page, track) => {
  const { status, text } = await page.evaluate(
    async ({ track, store }) => {
      const r = await fetch('/api/me/tracks?skipOld=false', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-multi-store-player-store': store },
        body: JSON.stringify([track]),
      })
      return { status: r.status, text: await r.text() }
    },
    { track, store: beatportUrl },
  )
  if (status < 200 || status >= 300) throw new Error(`Seeding "${track.title}" failed: HTTP ${status} — ${text}`)
}

const seedPlaybackDemoTracksViaApi = async (page) => {
  for (const track of playbackDemoTracks) {
    await seedPlaybackDemoTrackViaApi(page, track)
  }
}

module.exports = {
  seedPlaybackDemoTracksViaApi,
  BROKEN_PREVIEW_URL_PATTERN,
  WORKING_PREVIEW_URL,
  FALLBACK_TRACK_TITLE,
  BROKEN_TRACK_TITLE,
}
