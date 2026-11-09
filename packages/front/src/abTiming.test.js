import {
  formatSeconds,
  formatTempo,
  hasAlignment,
  loopRegion,
  matchedAtInTrack,
  previewTimeForSampleTime,
  sampleTimeForPreviewTime,
} from './abTiming'

const pair = { offsetSeconds: 30, tempoFactor: 1 }

describe('A/B time mapping', () => {
  it('switching to B keeps the place in the sample', () => {
    expect(previewTimeForSampleTime(pair, 4)).toBe(34)
    expect(previewTimeForSampleTime({ offsetSeconds: 10, tempoFactor: 1.02 }, 5)).toBeCloseTo(15.1)
  })

  it('switching to A maps back and clamps to the sample', () => {
    expect(sampleTimeForPreviewTime(pair, 36, 20)).toBe(6)
    expect(sampleTimeForPreviewTime(pair, 10, 20)).toBe(0)
    expect(sampleTimeForPreviewTime(pair, 90, 20)).toBe(20)
  })

  it('starts from zero without alignment', () => {
    const unaligned = { offsetSeconds: null, tempoFactor: null }
    expect(hasAlignment(unaligned)).toBe(false)
    expect(previewTimeForSampleTime(unaligned, 4)).toBe(0)
    expect(sampleTimeForPreviewTime(unaligned, 40)).toBe(0)
  })
})

describe('loopRegion', () => {
  it('spans the sample duration at the matched tempo', () => {
    expect(loopRegion({ offsetSeconds: 30, tempoFactor: 0.5 }, 20)).toEqual({ start: 30, end: 40 })
  })

  it('is null without alignment or duration', () => {
    expect(loopRegion({ offsetSeconds: null, tempoFactor: 1 }, 20)).toBeNull()
    expect(loopRegion(pair, undefined)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats the matched-at time in the track', () => {
    expect(formatSeconds(matchedAtInTrack(12.5, 120000))).toBe('2:13')
    expect(formatSeconds(matchedAtInTrack(12.4, 120000))).toBe('2:12')
    expect(formatSeconds(matchedAtInTrack(null, 120000))).toBe('—')
  })

  it('formats the tempo difference', () => {
    expect(formatTempo(1.012)).toBe('+1.2 %')
    expect(formatTempo(0.996)).toBe('−0.4 %')
    expect(formatTempo(1)).toBe('±0.0 %')
    expect(formatTempo(null)).toBe('—')
  })
})
