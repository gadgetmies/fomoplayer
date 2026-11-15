import { formatAudioDistance } from './audioDistance'

describe('formatAudioDistance', () => {
  it('shows the cosine distance ×100 with one decimal', () => {
    expect(formatAudioDistance(0.0152)).toBe('1.5')
    expect(formatAudioDistance(0.0603)).toBe('6.0')
    expect(formatAudioDistance(0.4237)).toBe('42.4')
  })

  it('shows the reference track itself as 0.0', () => {
    expect(formatAudioDistance(0)).toBe('0.0')
  })

  it('clamps the floating-point noise below zero', () => {
    expect(formatAudioDistance(-1e-9)).toBe('0.0')
  })

  it('shows a dash when there is no distance', () => {
    expect(formatAudioDistance(null)).toBe('-')
    expect(formatAudioDistance(undefined)).toBe('-')
    expect(formatAudioDistance(NaN)).toBe('-')
  })
})
