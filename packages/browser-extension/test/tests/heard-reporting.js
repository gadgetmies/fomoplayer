'use strict'

const assert = require('assert')
const { test } = require('cascade-test')

const {
  HEARD_MESSAGE_TYPE,
  buildHeardReportMessage,
  attachHeardReporting,
} = require('../../src/js/heard-reporting')

const createFakeAudio = () => {
  const target = new EventTarget()
  target.dispatchEventNamed = (name) => target.dispatchEvent(new Event(name))
  return target
}

test({
  'heard-reporting': {
    'buildHeardReportMessage': {
      'returns the bandcamp:report-heard envelope with the track payload': () => {
        const track = { fomoplayerTrackId: 42, title: 'fixture' }
        assert.deepStrictEqual(buildHeardReportMessage(track), {
          type: 'bandcamp:report-heard',
          track,
        })
        assert.strictEqual(HEARD_MESSAGE_TYPE, 'bandcamp:report-heard')
      },
    },

    'attachHeardReporting': {
      'sends a heard message synchronously when the audio play event fires': () => {
        const audio = createFakeAudio()
        const track = { fomoplayerTrackId: 7, title: 'fixture' }
        const sent = []
        attachHeardReporting(audio, () => track, (msg) => sent.push(msg))

        audio.dispatchEventNamed('play')

        assert.deepStrictEqual(sent, [{ type: 'bandcamp:report-heard', track }])
      },

      'does not delay reporting — message is emitted within the same tick as play': () => {
        const audio = createFakeAudio()
        const sent = []
        attachHeardReporting(audio, () => ({ fomoplayerTrackId: 1 }), (msg) => sent.push(msg))

        audio.dispatchEventNamed('play')
        assert.strictEqual(sent.length, 1, 'sendMessage must have been called synchronously')
      },

      'applies no minimum-playback-duration threshold (matches Preview.js onPlay)': () => {
        const audio = createFakeAudio()
        const sent = []
        attachHeardReporting(audio, () => ({ fomoplayerTrackId: 1 }), (msg) => sent.push(msg))

        audio.dispatchEventNamed('play')

        assert.strictEqual(sent.length, 1)
      },

      'skips when there is no current track (no fomoplayerTrackId mapping)': () => {
        const audio = createFakeAudio()
        const sent = []
        attachHeardReporting(audio, () => null, (msg) => sent.push(msg))

        audio.dispatchEventNamed('play')

        assert.strictEqual(sent.length, 0)
      },

      'swallows synchronous errors from sendMessage so playback is not disturbed': () => {
        const audio = createFakeAudio()
        attachHeardReporting(audio, () => ({ fomoplayerTrackId: 1 }), () => {
          throw new Error('runtime.sendMessage threw')
        })

        assert.doesNotThrow(() => audio.dispatchEventNamed('play'))
      },

      'swallows promise rejections from sendMessage so playback is not disturbed': async () => {
        const audio = createFakeAudio()
        attachHeardReporting(audio, () => ({ fomoplayerTrackId: 1 }), () =>
          Promise.reject(new Error('boom')),
        )

        audio.dispatchEventNamed('play')
        await new Promise((resolve) => setImmediate(resolve))
      },

      'returns a teardown function that removes the play listener': () => {
        const audio = createFakeAudio()
        const sent = []
        const detach = attachHeardReporting(
          audio,
          () => ({ fomoplayerTrackId: 1 }),
          (msg) => sent.push(msg),
        )

        audio.dispatchEventNamed('play')
        assert.strictEqual(sent.length, 1)

        detach()
        audio.dispatchEventNamed('play')
        assert.strictEqual(sent.length, 1, 'no new heard message must be sent after detach')
      },
    },
  },
})
