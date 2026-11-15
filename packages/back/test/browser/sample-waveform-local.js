// Local demo (demo-test workflow): runs against a backend in the same runner.
// The same steps as sample-waveform-preview.js. The runner has no object storage to upload to, so the sample is
// stored through the DB, with its waveform rendered by the same code the upload uses.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { insertSampleViaDb } = require('../lib/sample-waveform-seed')
const {
  playUploadedSample,
  assertStoredWaveformShown,
  assertClickingWaveformSeeks,
} = require('../lib/sample-waveform-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await insertSampleViaDb(await resolveTestUserId())
    await playUploadedSample(page)
    return { page, timeout: 30000 }
  },

  'the player shows the waveform rendered at upload': assertStoredWaveformShown,
  'clicking the waveform seeks in the sample': assertClickingWaveformSeeks,
})
