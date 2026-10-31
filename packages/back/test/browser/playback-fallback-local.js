// Local demo (demo-test workflow): runs against a backend in the same runner.
// Plays a track whose first preview is broken and checks that the player falls back to its working sample, then
// plays a track with only a broken preview and checks that the row is flagged with a warning triangle and the
// player skips to the next track. The tracks are seeded through POST /api/me/tracks, the same way as in the
// preview test.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedPlaybackDemoTracksViaApi } = require('../lib/playback-fallback-seed')
const {
  openRecentTracks,
  assertFallsBackToWorkingPreview,
  assertSkipsTrackWithoutPlayablePreview,
} = require('../lib/playback-fallback-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedPlaybackDemoTracksViaApi(page)
    await openRecentTracks(page)
    return { page, timeout: 30000 }
  },

  'a broken preview falls back to the next preview': assertFallsBackToWorkingPreview,
  'a track with no playable preview is flagged and skipped': assertSkipsTrackWithoutPlayablePreview,
})
