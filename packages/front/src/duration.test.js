import { formatDuration } from './duration'

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(245000)).toBe('04:05')
    expect(formatDuration('245000')).toBe('04:05')
  })

  it('keeps hours for long tracks', () => {
    expect(formatDuration(3723000)).toBe('01:02:03')
  })

  it('returns a dash for an unknown duration instead of throwing', () => {
    expect(formatDuration(undefined)).toBe('-')
    expect(formatDuration(null)).toBe('-')
    expect(formatDuration('')).toBe('-')
    expect(formatDuration('abc')).toBe('-')
    expect(formatDuration(NaN)).toBe('-')
    expect(formatDuration(-1)).toBe('-')
  })
})
