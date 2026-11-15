const fs = require('fs')
const path = require('path')
const sql = require('sql-template-strings')

// The sample uploaded for the sample waveform demo: 20 s of a tone, quiet for 5 s, loud for 5 s, pulsing for 5 s and
// loud again, so the waveform shows where each part is and where a click seeks to.
const SAMPLE_WAVEFORM_FILENAME = 'sample-waveform-demo.mp3'
const SAMPLE_WAVEFORM_DURATION_SECONDS = 20
const fixture = () => fs.readFileSync(path.resolve(__dirname, '../fixtures/sample-waveform-demo.mp3'))

// Uploads the sample through the API in the browser session, as the Upload button does (the email check is the
// page's: the endpoint itself takes the upload). Earlier runs' copies are deleted first, so re-runs against the
// persistent preview leave one.
const uploadSampleViaApi = async (page) => {
  const { status, text } = await page.evaluate(
    async ({ filename, base64 }) => {
      const samples = await fetch('/api/me/notifications/audio-samples', { credentials: 'same-origin' }).then((r) =>
        r.json(),
      )
      for (const { id } of samples.filter((sample) => sample.filename === filename)) {
        await fetch(`/api/me/notifications/audio-samples/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      }
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const body = new FormData()
      body.append('audioFile', new File([bytes], filename, { type: 'audio/mpeg' }))
      const r = await fetch('/api/me/notifications/audio-samples', { method: 'POST', credentials: 'same-origin', body })
      return { status: r.status, text: await r.text() }
    },
    { filename: SAMPLE_WAVEFORM_FILENAME, base64: fixture().toString('base64') },
  )
  if (status !== 201) throw new Error(`Uploading the demo sample failed: HTTP ${status} — ${text}`)
}

// Local only: the runner has no object storage to upload to, so the sample is inserted as the upload would store it,
// with its waveform rendered by the same code, and the audio and image inlined as data URLs.
const insertSampleViaDb = async (userId) => {
  const { pg } = require('./db')
  const { generateSampleWaveform } = require('../../routes/shared/sample-waveform')
  const audio = fixture()
  const { png, durationMs } = await generateSampleWaveform(audio)
  await pg.queryAsync(sql`
    DELETE FROM user_notification_audio_sample
    WHERE meta_account_user_id = ${userId} AND user_notification_audio_sample_filename = ${SAMPLE_WAVEFORM_FILENAME}
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name, user_notification_audio_sample_object_key,
       user_notification_audio_sample_url, user_notification_audio_sample_file_size,
       user_notification_audio_sample_file_type, user_notification_audio_sample_filename,
       user_notification_audio_sample_waveform_object_key, user_notification_audio_sample_waveform_url,
       user_notification_audio_sample_duration_ms)
    VALUES (${userId}, 'demo', ${`sample-waveform-demo-${userId}.mp3`},
            ${`data:audio/mpeg;base64,${audio.toString('base64')}`}, ${audio.length}, 'audio/mpeg',
            ${SAMPLE_WAVEFORM_FILENAME}, ${`sample-waveform-demo-${userId}.waveform.png`},
            ${`data:image/png;base64,${png.toString('base64')}`}, ${durationMs})
  `)
}

module.exports = {
  uploadSampleViaApi,
  insertSampleViaDb,
  SAMPLE_WAVEFORM_FILENAME,
  SAMPLE_WAVEFORM_DURATION_SECONDS,
}
