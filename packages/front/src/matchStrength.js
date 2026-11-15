// How strong a sample's fingerprint match is. The score is the number of fingerprint hashes that line up at one time
// offset between the sample and the track; the matcher drops anything under 3 as noise. Measured on production
// previews (analyser/README.md, "Production follow-up 2026-10-11"): unrelated tracks reach 4, a real recording scored 5
// against a 2-minute preview excerpt and 29 against another. So up to 5 is barely above that noise, and 15 or more
// is well clear of it.
const STRONG_FROM = 15
const GOOD_FROM = 6

export const matchStrength = (score) => {
  if (typeof score === 'number' && score >= STRONG_FROM) return { level: 'strong', label: 'Strong' }
  if (typeof score === 'number' && score >= GOOD_FROM) return { level: 'good', label: 'Good' }
  return { level: 'weak', label: 'Weak' }
}

export const matchStrengthTitle = (score) => {
  const { label } = matchStrength(score)
  return `${label} match: ${score} fingerprint points line up at one moment. Unrelated tracks reach about 4; ${GOOD_FROM}+ is good, ${STRONG_FROM}+ strong.`
}
