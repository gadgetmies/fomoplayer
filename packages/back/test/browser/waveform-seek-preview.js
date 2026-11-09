// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// Plays a Beatport track that has no stored waveform, so the waveform is generated from the 120 s sample that starts
// mid-track, and checks that the progress and click-to-seek map onto that sample rather than the full track. The
// track is seeded through POST /api/me/tracks, the same way as in the local test.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedWaveformlessTrackViaApi } = require('../lib/waveform-seek-seed')
const {
  playWaveformlessTrack,
  assertProgressStaysOnWaveform,
  assertClickingWaveformSeeks,
} = require('../lib/waveform-seek-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedWaveformlessTrackViaApi(page)
    await playWaveformlessTrack(page)
    return { page, timeout: 30000 }
  },

  'playback progress is drawn within the generated waveform': assertProgressStaysOnWaveform,
  'clicking the generated waveform seeks within the sample': assertClickingWaveformSeeks,
})
