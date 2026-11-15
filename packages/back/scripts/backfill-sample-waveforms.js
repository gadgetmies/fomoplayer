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
// It is DRY-RUN by default. Flags:
//   --apply        render and store the waveforms (otherwise only list them)
//   --limit=N      stop after N samples (default: all)
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT and the
// AUDIO_SAMPLE_STORAGE_* variables), e.g.
// `npx dotenv -e .env.development -- node scripts/backfill-sample-waveforms.js`.

const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const { queryNotificationAudioSamplesWithoutWaveform } = require('../routes/users/db')
const { storeSampleWaveform } = require('../routes/users/sample-waveforms')

const PAGE_SIZE = 50

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

const readObject = async (client, bucketName, objectKey) => {
  const chunks = []
  for await (const chunk of await client.getObject(bucketName, objectKey)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const main = async () => {
  const { apply, limit } = parseArgs(process.argv.slice(2))
  const client = getMinioClient()
  const bucketName = getBucketName()
  if (apply && (!client || !bucketName)) throw new Error('Object storage is not configured')

  let afterId = 0
  let seen = 0
  let stored = 0
  let failed = 0
  while (seen < limit) {
    const samples = await queryNotificationAudioSamplesWithoutWaveform(afterId, Math.min(PAGE_SIZE, limit - seen))
    if (samples.length === 0) break
    for (const sample of samples) {
      afterId = sample.id
      seen++
      if (!apply) {
        console.log(`would render sample ${sample.id} (${sample.fileType}) ${sample.filename}`)
        continue
      }
      // A sample is read from the bucket it was uploaded to, the waveform is written to the current one
      try {
        const audio = await readObject(client, sample.bucketName, sample.objectKey)
        const { durationMs } = await storeSampleWaveform({
          client,
          bucketName,
          sampleId: sample.id,
          sampleObjectKey: sample.objectKey,
          audio,
        })
        stored++
        console.log(`rendered sample ${sample.id}: ${durationMs} ms`)
      } catch (error) {
        failed++
        console.error(`could not render sample ${sample.id} (${sample.fileType}) ${sample.filename}: ${error.message}`)
      }
    }
  }
  console.log(
    apply ? `Done: ${stored} stored, ${failed} failed of ${seen}` : `Dry run: ${seen} samples without a waveform`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
