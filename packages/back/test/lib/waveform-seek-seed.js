const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const concussionFixture = require('../fixtures/noisia_concussion_beatport.json')

// A Beatport track whose 120 s sample starts ~134 s into the track and that has no stored waveform image, so the
// player generates the waveform from the sample file itself. The store ids, catalog number and title are unique
// and the ISRC is dropped so the backend does not merge it into the seeded Concussion track (whose waveform the
// player would otherwise reuse).
const [concussion] = beatportTracksTransform(concussionFixture)
const { waveform, isrc, store_details, ...concussionWithoutWaveform } = concussion

const WAVEFORM_SEEK_TRACK_TITLE = 'Concussion (Waveform Seek Demo)'
const waveformSeekTrack = {
  ...concussionWithoutWaveform,
  id: '990000001',
  title: WAVEFORM_SEEK_TRACK_TITLE,
  url: 'https://www.beatport.com/track/concussion-waveform-seek-demo/990000001',
  release: {
    ...concussion.release,
    id: '990000001',
    catalog_number: 'FOMO-WAVEFORM-SEEK-DEMO',
    url: 'https://www.beatport.com/release/waveform-seek-demo/990000001',
  },
}

// Same endpoint the browser extension uses; adding the same store track again is an upsert, so re-runs against
// the persistent preview are safe. skipOld=false because the fixture was published in 2005.
const seedWaveformlessTrackViaApi = async (page) => {
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
    { track: waveformSeekTrack, store: beatportUrl },
  )
  if (status < 200 || status >= 300) throw new Error(`Seeding waveform seek track failed: HTTP ${status} — ${text}`)
}

module.exports = { seedWaveformlessTrackViaApi, WAVEFORM_SEEK_TRACK_TITLE }
