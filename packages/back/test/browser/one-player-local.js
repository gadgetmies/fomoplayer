// Local demo (demo-test workflow): runs against a backend in the same runner.
// One player for the whole app: a track started from Discover · Recent keeps playing on Settings in the docked mini
// player, "From <list>" links back to the list once away from it, next follows that list, and playing from a search
// switches the source. The tracks are seeded through POST /api/me/tracks, the same way in both demos.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const {
  playFromRecent,
  assertNoPlayingFromOnItsList,
  assertDockedPlayerKeepsPlaying,
  assertDockedNextFollowsSource,
  assertDockedWaveformSeeks,
  assertDockedPauseStopsAudio,
  assertPlayingFromSearchSwitchesSource,
} = require('../lib/one-player-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    const { order } = await playFromRecent(page)
    return { page, order, timeout: 45000 }
  },

  'the player does not link back to the list on screen': assertNoPlayingFromOnItsList,
  'Settings shows the docked player and playback continues': assertDockedPlayerKeepsPlaying,
  'next on the docked player follows Discover · Recent': assertDockedNextFollowsSource,
  'the docked waveform shows the position and seeks': assertDockedWaveformSeeks,
  'the docked player pauses and resumes playback': assertDockedPauseStopsAudio,
  'playing from a search switches the source': assertPlayingFromSearchSwitchesSource,
})
