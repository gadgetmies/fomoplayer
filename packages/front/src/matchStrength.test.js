import { matchStrength, matchStrengthTitle } from './matchStrength'

describe('matchStrength', () => {
  it('calls scores up to the noise ceiling weak', () => {
    expect(matchStrength(3).level).toBe('weak')
    expect(matchStrength(5).level).toBe('weak')
  })

  it('calls scores clear of the noise good', () => {
    expect(matchStrength(6).level).toBe('good')
    expect(matchStrength(14).level).toBe('good')
  })

  it('calls scores well clear of the noise strong', () => {
    expect(matchStrength(15)).toEqual({ level: 'strong', label: 'Strong' })
    expect(matchStrength(159).level).toBe('strong')
  })

  it('treats a missing score as weak', () => {
    expect(matchStrength(undefined).level).toBe('weak')
    expect(matchStrength(null).level).toBe('weak')
  })

  it('explains the score in the tooltip', () => {
    expect(matchStrengthTitle(29)).toMatch(/^Strong match: 29 fingerprint points/)
  })
})
