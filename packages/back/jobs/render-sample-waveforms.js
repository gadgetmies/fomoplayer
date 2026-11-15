const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const { backfillSampleWaveforms } = require('../routes/users/sample-waveforms')
const logger = require('fomoplayer_shared').logger(__filename)

// Samples rendered per run. An admin starts the job from Admin › Jobs and the request waits for it, so a run is
// kept short; the next run continues with the samples that are still without a waveform.
const MAX_SAMPLES_PER_RUN = 200

// Renders and stores the waveforms of uploaded audio samples that have none (uploaded before waveforms were
// rendered at upload, or whose rendering failed), the same backfill as scripts/backfill-sample-waveforms.js --apply.
// Runs in production with its storage and database, so nobody needs their credentials to backfill. The run fails
// when a sample cannot be rendered, listing which and why; the others are stored all the same.
module.exports.renderSampleWaveforms = async (
  _jobRun,
  { client = getMinioClient(), bucketName = getBucketName(), limit = MAX_SAMPLES_PER_RUN } = {},
) => {
  if (!client || !bucketName) return { success: false, result: { error: 'Object storage is not configured' } }
  const { seen, stored, failed } = await backfillSampleWaveforms({
    client,
    bucketName,
    apply: true,
    limit,
    onSample: ({ sample, status, error }) => {
      if (status === 'failed')
        logger.warn('Could not render a sample waveform', { sampleId: sample.id, error: error.message })
    },
  })
  return { success: failed.length === 0, result: { seen, stored, failed, moreMayRemain: seen === limit } }
}
