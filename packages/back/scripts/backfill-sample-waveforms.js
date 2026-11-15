#!/usr/bin/env node

// Renders and stores waveform images for uploaded audio samples that have none.
//
// Samples get their waveform when they are uploaded. Samples uploaded before
// that, and ones whose rendering failed, have none: the player then downloads
// and decodes the whole sample in the browser to draw one, and until it has,
// the sample has no duration to seek in. This script downloads each such
// sample from the bucket, renders its waveform with the same code as the
// upload and records it with the sample's duration.
//
// In production the same backfill runs as the renderSampleWaveforms job,
// started from Admin › Jobs, without anyone needing its credentials.
//
// It is DRY-RUN by default. Flags:
//   --apply        render and store the waveforms (otherwise only list them)
//   --limit=N      stop after N samples (default: all)
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT and the
// AUDIO_SAMPLE_STORAGE_* variables), e.g.
// `npx dotenv -e .env.development -- node scripts/backfill-sample-waveforms.js`.

const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const { backfillSampleWaveforms } = require('../routes/users/sample-waveforms')

const parseArgs = (argv) => {
  const args = { apply: false, limit: Infinity }
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length))
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!(args.limit > 0)) throw new Error('--limit must be a positive number')
  return args
}

const logSample = ({ sample, status, durationMs, error }) => {
  const name = `sample ${sample.id} (${sample.fileType}) ${sample.filename}`
  if (status === 'pending') console.log(`would render ${name}`)
  else if (status === 'stored') console.log(`rendered sample ${sample.id}: ${durationMs} ms`)
  else console.error(`could not render ${name}: ${error.message}`)
}

const main = async () => {
  const { apply, limit } = parseArgs(process.argv.slice(2))
  const { seen, stored, failed } = await backfillSampleWaveforms({
    client: getMinioClient(),
    bucketName: getBucketName(),
    apply,
    limit,
    onSample: logSample,
  })
  console.log(
    apply
      ? `Done: ${stored} stored, ${failed.length} failed of ${seen}`
      : `Dry run: ${seen} samples without a waveform`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
