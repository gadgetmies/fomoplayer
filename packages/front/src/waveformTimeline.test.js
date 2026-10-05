import { getWaveformTimeline } from './waveformTimeline'

// Beatport sample: a 120 s clip taken 126.72 s into a 316.8 s track
const beatportPreview = { start_ms: 126720, end_ms: 246720, length_ms: 120000 }
const trackDuration = 316800

describe('getWaveformTimeline', () => {
  it('places the preview within the full track when the waveform covers the full track', () => {
    const timeline = getWaveformTimeline({
      previewDetails: beatportPreview,
      trackDuration,
      generatedWaveformDuration: undefined,
      shouldSkip: false,
    })

    expect(timeline).toMatchObject({ totalDuration: 316800, startOffset: 126720, endPosition: 246720 })
    expect(timeline.toPositionPercent(0)).toBeCloseTo(40)
    expect(timeline.toPositionPercent(120000)).toBeCloseTo((246720 / 316800) * 100)
  })

  it('uses a preview-relative timeline when the waveform was generated from the preview clip', () => {
    const timeline = getWaveformTimeline({
      previewDetails: beatportPreview,
      trackDuration,
      generatedWaveformDuration: 120000,
      shouldSkip: false,
    })

    expect(timeline).toMatchObject({ totalDuration: 120000, startOffset: 0, endPosition: 120000 })
    expect(timeline.toPositionPercent(0)).toBe(0)
    expect(timeline.toPositionPercent(60000)).toBeCloseTo(50)
    expect(timeline.toPositionPercent(120000)).toBeCloseTo(100)
  })

  it('uses the generated waveform duration as the end when the preview has no window', () => {
    const timeline = getWaveformTimeline({
      previewDetails: { start_ms: null, end_ms: null, length_ms: null },
      trackDuration,
      generatedWaveformDuration: 30000,
      shouldSkip: false,
    })

    expect(timeline).toMatchObject({ totalDuration: 30000, startOffset: 0, endPosition: 30000 })
    expect(timeline.toPositionPercent(15000)).toBeCloseTo(50)
  })

  it('does not offset the position when skipping within a full-length preview', () => {
    const timeline = getWaveformTimeline({
      previewDetails: { start_ms: 120000, end_ms: 280000, length_ms: 160000 },
      trackDuration: 400000,
      generatedWaveformDuration: undefined,
      shouldSkip: true,
    })

    expect(timeline.startOffset).toBe(120000)
    expect(timeline.toPositionPercent(200000)).toBeCloseTo(50)
  })

  it('returns an empty timeline without a preview', () => {
    const timeline = getWaveformTimeline({ previewDetails: null, trackDuration, shouldSkip: false })

    expect(timeline).toMatchObject({ totalDuration: 0, startOffset: 0, endPosition: 0 })
    expect(timeline.toPositionPercent(1000)).toBe(0)
  })
})
