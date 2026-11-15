const { PassThrough } = require('stream')
const { make, encodePNGToStream } = require('pureimage')

// Renders the waveform image of an uploaded audio sample (WAV or MP3) on the server, so the player can show it and
// seek in the sample without downloading and decoding the whole file in the browser.
//
// The image matches the one the player generates in the browser (waveform-generator-web, see Preview.js): 1024 x 170,
// one column per pixel holding the RMS level of that slice of the sample, the left channel drawn up from the centre
// and the right channel down, scaled so the loudest column fills its half, with a one pixel line across the centre.

const WAVEFORM_WIDTH = 1024
const WAVEFORM_HEIGHT = 170
const WAVEFORM_COLOR = '#cbcbcb'
// Decoded audio is reduced to the sum of squares of blocks of this many frames as it is decoded, so a long sample
// never has to be held in memory as floats.
const BLOCK_FRAMES = 256
// MP3 input is fed to the decoder in slices of this size
const MP3_CHUNK_BYTES = 64 * 1024

class LevelAccumulator {
  constructor() {
    this.blocks = [] // [sumOfSquaresLeft, sumOfSquaresRight, frameCount] per block
    this.frames = 0
    this.current = [0, 0, 0]
  }

  // left and right are Float32Arrays of equal length (the same array for mono audio)
  add(left, right, length = left.length) {
    for (let i = 0; i < length; i++) {
      this.current[0] += left[i] * left[i]
      this.current[1] += right[i] * right[i]
      if (++this.current[2] === BLOCK_FRAMES) {
        this.blocks.push(this.current)
        this.current = [0, 0, 0]
      }
    }
    this.frames += length
  }

  finish() {
    if (this.current[2] > 0) this.blocks.push(this.current)
    this.current = [0, 0, 0]
    return this.blocks
  }
}

// RMS levels of the left and right channel for each of width columns
const columnLevels = (blocks, width) => {
  const columns = []
  for (let column = 0; column < width; column++) {
    const first = Math.floor((column * blocks.length) / width)
    const last = Math.max(first, Math.floor(((column + 1) * blocks.length) / width) - 1)
    let left = 0
    let right = 0
    let frames = 0
    for (let b = first; b <= last && b < blocks.length; b++) {
      left += blocks[b][0]
      right += blocks[b][1]
      frames += blocks[b][2]
    }
    columns.push(frames ? [Math.sqrt(left / frames), Math.sqrt(right / frames)] : [0, 0])
  }
  return columns
}

const readFourCC = (buffer, offset) => buffer.toString('ascii', offset, offset + 4)

const WAVE_FORMAT_PCM = 1
const WAVE_FORMAT_IEEE_FLOAT = 3
const WAVE_FORMAT_EXTENSIBLE = 0xfffe

const isWav = (buffer) => buffer.length >= 12 && readFourCC(buffer, 0) === 'RIFF' && readFourCC(buffer, 8) === 'WAVE'

// Reads the levels of a PCM (8, 16, 24 or 32 bit integer) or IEEE float (32 or 64 bit) WAV file
const decodeWav = (buffer, accumulator) => {
  let offset = 12
  let format
  while (offset + 8 <= buffer.length) {
    const id = readFourCC(buffer, offset)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      let audioFormat = buffer.readUInt16LE(body)
      if (audioFormat === WAVE_FORMAT_EXTENSIBLE && size >= 26) audioFormat = buffer.readUInt16LE(body + 24)
      format = {
        audioFormat,
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      if (!format) throw new Error('WAV data chunk before fmt chunk')
      const { audioFormat, channels, sampleRate, bitsPerSample } = format
      const bytesPerSample = bitsPerSample / 8
      const read = {
        [`${WAVE_FORMAT_PCM}:8`]: (o) => (buffer.readUInt8(o) - 128) / 128,
        [`${WAVE_FORMAT_PCM}:16`]: (o) => buffer.readInt16LE(o) / 32768,
        [`${WAVE_FORMAT_PCM}:24`]: (o) => buffer.readIntLE(o, 3) / 8388608,
        [`${WAVE_FORMAT_PCM}:32`]: (o) => buffer.readInt32LE(o) / 2147483648,
        [`${WAVE_FORMAT_IEEE_FLOAT}:32`]: (o) => buffer.readFloatLE(o),
        [`${WAVE_FORMAT_IEEE_FLOAT}:64`]: (o) => buffer.readDoubleLE(o),
      }[`${audioFormat}:${bitsPerSample}`]
      if (!read || channels < 1 || !sampleRate) {
        throw new Error(`Unsupported WAV format ${audioFormat} with ${bitsPerSample} bits and ${channels} channels`)
      }
      // A truncated file (or a streamed one with a placeholder size) is read up to its end
      const end = Math.min(buffer.length, body + size)
      const frameBytes = bytesPerSample * channels
      const frames = Math.floor((end - body) / frameBytes)
      const sliceFrames = 4096
      const left = new Float32Array(sliceFrames)
      const right = channels > 1 ? new Float32Array(sliceFrames) : left
      for (let start = 0; start < frames; start += sliceFrames) {
        const count = Math.min(sliceFrames, frames - start)
        for (let i = 0; i < count; i++) {
          const frame = body + (start + i) * frameBytes
          left[i] = read(frame)
          if (channels > 1) right[i] = read(frame + bytesPerSample)
        }
        accumulator.add(left, right, count)
      }
      return { sampleRate }
    }
    // Chunks are padded to an even size
    offset = body + size + (size % 2)
  }
  throw new Error('WAV file has no data chunk')
}

const decodeMp3 = async (buffer, accumulator) => {
  const { MPEGDecoder } = await import('mpg123-decoder')
  const decoder = new MPEGDecoder()
  await decoder.ready
  try {
    let sampleRate
    for (let offset = 0; offset < buffer.length; offset += MP3_CHUNK_BYTES) {
      const {
        channelData,
        samplesDecoded,
        sampleRate: rate,
      } = decoder.decode(
        new Uint8Array(buffer.buffer, buffer.byteOffset + offset, Math.min(MP3_CHUNK_BYTES, buffer.length - offset)),
      )
      if (samplesDecoded > 0) {
        sampleRate = rate
        accumulator.add(channelData[0], channelData[1] ?? channelData[0], samplesDecoded)
      }
    }
    if (!sampleRate) throw new Error('No MPEG audio frames found')
    return { sampleRate }
  } finally {
    decoder.free()
  }
}

// Reads the duration and per-column levels of a WAV or MP3 file. Throws when the file cannot be decoded.
const analyseSample = async (buffer, { width = WAVEFORM_WIDTH } = {}) => {
  const accumulator = new LevelAccumulator()
  const { sampleRate } = isWav(buffer) ? decodeWav(buffer, accumulator) : await decodeMp3(buffer, accumulator)
  if (accumulator.frames === 0) throw new Error('The sample contains no audio')
  return {
    durationMs: Math.round((accumulator.frames / sampleRate) * 1000),
    columns: columnLevels(accumulator.finish(), width),
  }
}

const renderWaveformPng = async (columns, { height = WAVEFORM_HEIGHT, color = WAVEFORM_COLOR } = {}) => {
  const width = columns.length
  const canvas = make(width, height)
  const ctx = canvas.getContext('2d')
  // pureimage starts with opaque black: the image must be transparent, as the player uses it as a mask too
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = color
  const middle = height / 2
  const max = Math.max(...columns.flat())
  const scale = max > 0 ? middle / max : 0
  columns.forEach(([left, right], x) => {
    const up = Math.round(left * scale)
    const down = Math.round(right * scale)
    if (up > 0) ctx.fillRect(x, middle - up, 1, up)
    if (down > 0) ctx.fillRect(x, middle, 1, down)
  })
  ctx.fillRect(0, middle - 2, width, 1)

  const stream = new PassThrough()
  const chunks = []
  stream.on('data', (chunk) => chunks.push(chunk))
  await encodePNGToStream(canvas, stream)
  return Buffer.concat(chunks)
}

// The waveform image (PNG) and duration of a WAV or MP3 sample
const generateSampleWaveform = async (buffer) => {
  const { durationMs, columns } = await analyseSample(buffer)
  return { durationMs, png: await renderWaveformPng(columns) }
}

module.exports = { analyseSample, renderWaveformPng, generateSampleWaveform, WAVEFORM_WIDTH, WAVEFORM_HEIGHT }
