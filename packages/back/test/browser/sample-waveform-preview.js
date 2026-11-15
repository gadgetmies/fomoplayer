// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// Uploads an audio sample through the API, which renders its waveform on the server, then plays it from
// Notifications › Samples: the player shows the stored waveform and duration, and clicking the waveform seeks.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { uploadSampleViaApi } = require('../lib/sample-waveform-seed')
const {
  playUploadedSample,
  assertStoredWaveformShown,
  assertClickingWaveformSeeks,
} = require('../lib/sample-waveform-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await uploadSampleViaApi(page)
    await playUploadedSample(page)
    return { page, timeout: 30000 }
  },

  'the player shows the waveform rendered at upload': assertStoredWaveformShown,
  'clicking the waveform seeks in the sample': assertClickingWaveformSeeks,
})
