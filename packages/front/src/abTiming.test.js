import { formatSeconds, formatTempo, hasAlignment, matchedAtInTrack } from './abTiming'

describe('hasAlignment', () => {
  it('needs an offset and a positive tempo factor', () => {
    expect(hasAlignment({ offsetSeconds: 30, tempoFactor: 1 })).toBe(true)
    expect(hasAlignment({ offsetSeconds: null, tempoFactor: null })).toBe(false)
    expect(hasAlignment({ offsetSeconds: 30, tempoFactor: 0 })).toBe(false)
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
