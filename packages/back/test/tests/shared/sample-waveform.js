const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { PassThrough } = require('stream')
const { test } = require('cascade-test')
const { decodePNGFromStream } = require('pureimage')
const {
  analyseSample,
  generateSampleWaveform,
  WAVEFORM_WIDTH,
  WAVEFORM_HEIGHT,
} = require('../../../routes/shared/sample-waveform')

// A 4 s, 22.05 kHz mono MP3 of a 440 Hz tone at a tenth of full level for 2 s, then at full level
const MP3_FIXTURE = path.resolve(__dirname, '../../fixtures/sample-waveform-quiet-then-loud.mp3')

// A PCM WAV file of a 440 Hz tone whose level per channel is given by level(channel, seconds)
const toneWav = ({ seconds, sampleRate = 8000, channels = 2, bits = 16, level }) => {
  const frames = seconds * sampleRate
  const bytesPerSample = bits / 8
  const data = Buffer.alloc(frames * channels * bytesPerSample)
  for (let frame = 0; frame < frames; frame++) {
    const t = frame / sampleRate
    for (let channel = 0; channel < channels; channel++) {
      const value = level(channel, t) * Math.sin(2 * Math.PI * 440 * t)
      const offset = (frame * channels + channel) * bytesPerSample
      if (bits === 16) data.writeInt16LE(Math.round(value * 32767), offset)
      else data.writeIntLE(Math.round(value * 8388607), offset, 3)
    }
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  header.writeUInt16LE(channels * bytesPerSample, 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const decodePng = (png) => {
  const stream = new PassThrough()
  stream.end(png)
  return decodePNGFromStream(stream)
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

test({
  'reads the duration and levels of a 16 bit stereo WAV, left and right apart': async () => {
    const wav = toneWav({ seconds: 3, level: (channel) => (channel === 0 ? 0.8 : 0.2) })
    const { durationMs, columns } = await analyseSample(wav)
    assert.strictEqual(durationMs, 3000)
    assert.strictEqual(columns.length, WAVEFORM_WIDTH)
    // The RMS level of a sine is its amplitude / sqrt(2)
    assert.ok(Math.abs(average(columns.map(([left]) => left)) - 0.8 / Math.SQRT2) < 0.02)
    assert.ok(Math.abs(average(columns.map(([, right]) => right)) - 0.2 / Math.SQRT2) < 0.02)
  },

  'reads a 24 bit mono WAV, with the level over time in the columns': async () => {
    const wav = toneWav({ seconds: 2, channels: 1, bits: 24, level: (_, t) => (t < 1 ? 0.1 : 1) })
    const { durationMs, columns } = await analyseSample(wav)
    assert.strictEqual(durationMs, 2000)
    const quiet = average(columns.slice(0, WAVEFORM_WIDTH / 2 - 10).map(([left]) => left))
    const loud = average(columns.slice(WAVEFORM_WIDTH / 2 + 10).map(([left]) => left))
    assert.ok(loud / quiet > 8, `loud ${loud} vs quiet ${quiet}`)
  },

  'decodes an MP3': async () => {
    const { durationMs, columns } = await analyseSample(fs.readFileSync(MP3_FIXTURE))
    // The encoder pads the stream with up to a frame of silence at both ends
    assert.ok(Math.abs(durationMs - 4000) < 150, `duration ${durationMs}`)
    const quiet = average(columns.slice(50, WAVEFORM_WIDTH / 2 - 50).map(([left]) => left))
    const loud = average(columns.slice(WAVEFORM_WIDTH / 2 + 50, WAVEFORM_WIDTH - 50).map(([left]) => left))
    assert.ok(loud / quiet > 8, `loud ${loud} vs quiet ${quiet}`)
  },

  'renders a transparent PNG the size of the player waveform, louder parts taller': async () => {
    const wav = toneWav({ seconds: 2, channels: 1, level: (_, t) => (t < 1 ? 0.2 : 1) })
    const { png, durationMs } = await generateSampleWaveform(wav)
    assert.strictEqual(durationMs, 2000)
    const image = await decodePng(png)
    assert.strictEqual(image.width, WAVEFORM_WIDTH)
    assert.strictEqual(image.height, WAVEFORM_HEIGHT)
    const isDrawn = (x, y) => (image.getPixelRGBA(x, y) & 0xff) !== 0
    const columnHeight = (x) => Array.from({ length: WAVEFORM_HEIGHT }, (_, y) => isDrawn(x, y)).filter(Boolean).length
    // Corners stay transparent, the loud half fills the height and the quiet half a fifth of it
    assert.strictEqual(isDrawn(0, 0), false)
    assert.ok(columnHeight(900) >= WAVEFORM_HEIGHT - 2, `loud column ${columnHeight(900)}`)
    assert.ok(Math.abs(columnHeight(100) - WAVEFORM_HEIGHT / 5) < 4, `quiet column ${columnHeight(100)}`)
  },

  'rejects audio it cannot decode': async () => {
    await assert.rejects(analyseSample(Buffer.from('not audio at all')))
  },

  'rejects a WAV it cannot read': async () => {
    const wav = toneWav({ seconds: 1, level: () => 0.5 })
    wav.writeUInt16LE(2, 20) // ADPCM
    await assert.rejects(analyseSample(wav), /Unsupported WAV format/)
  },
})
