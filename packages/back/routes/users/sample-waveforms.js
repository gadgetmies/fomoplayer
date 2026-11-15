const path = require('path')
const { generateSampleWaveform } = require('../shared/sample-waveform')
const { storageObjectPath } = require('../shared/minio')
const { updateNotificationAudioSampleWaveform } = require('./db')

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

module.exports = { storeSampleWaveform, waveformObjectKeyFor }
