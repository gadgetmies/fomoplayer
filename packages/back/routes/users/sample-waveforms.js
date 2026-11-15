const path = require('path')
const { generateSampleWaveform } = require('../shared/sample-waveform')
const { storageObjectPath } = require('../shared/minio')
const { updateNotificationAudioSampleWaveform, queryNotificationAudioSamplesWithoutWaveform } = require('./db')

const PAGE_SIZE = 50

// The waveform image sits next to the sample in the bucket: notification-samples/<user>/<uuid>.waveform.png
const waveformObjectKeyFor = (sampleObjectKey) => {
  const { dir, name } = path.posix.parse(sampleObjectKey)
  return path.posix.join(dir, `${name}.waveform.png`)
}

// Renders the waveform of a sample's audio, stores the image in the bucket and records it with the sample's
// duration. Throws when the audio cannot be decoded or the image cannot be stored; the sample is left without one.
const storeSampleWaveform = async ({ client, bucketName, sampleId, sampleObjectKey, audio }) => {
  const { png, durationMs } = await generateSampleWaveform(audio)
  const waveformObjectKey = waveformObjectKeyFor(sampleObjectKey)
  await client.putObject(bucketName, waveformObjectKey, png, png.length, { 'Content-Type': 'image/png' })
  const waveform = { waveformObjectKey, waveformUrl: storageObjectPath(waveformObjectKey), durationMs }
  await updateNotificationAudioSampleWaveform(sampleId, waveform)
  return waveform
}

const readObject = async (client, bucketName, objectKey) => {
  const chunks = []
  for await (const chunk of await client.getObject(bucketName, objectKey)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// Renders and stores the waveforms of up to limit samples (of all users) that have none, in id order: samples
// uploaded before waveforms were rendered at upload, and ones whose rendering failed. Without apply it only lists
// them. A sample that fails is reported and skipped, so it does not stop the rest. onSample is told about each one.
const backfillSampleWaveforms = async ({ client, bucketName, apply, limit = Infinity, onSample = () => {} }) => {
  if (apply && (!client || !bucketName)) throw new Error('Object storage is not configured')
  let afterId = 0
  let seen = 0
  let stored = 0
  const failed = []
  while (seen < limit) {
    const samples = await queryNotificationAudioSamplesWithoutWaveform(afterId, Math.min(PAGE_SIZE, limit - seen))
    if (samples.length === 0) break
    for (const sample of samples) {
      afterId = sample.id
      seen++
      if (!apply) {
        onSample({ sample, status: 'pending' })
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
        onSample({ sample, status: 'stored', durationMs })
      } catch (error) {
        failed.push({ id: sample.id, fileType: sample.fileType, filename: sample.filename, error: error.message })
        onSample({ sample, status: 'failed', error })
      }
    }
  }
  return { seen, stored, failed }
}

module.exports = { storeSampleWaveform, waveformObjectKeyFor, backfillSampleWaveforms }
