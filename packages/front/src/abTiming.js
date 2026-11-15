// Timing of a sample's fingerprint match. The matcher's model is
// preview_time = offset + tempoFactor · sample_time, with both times in seconds of the respective audio files.

export const hasAlignment = (pair) =>
  Number.isFinite(pair?.offsetSeconds) && Number.isFinite(pair?.tempoFactor) && pair.tempoFactor > 0

// m:ss
export const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds)) return '—'
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

// Where the sample sits in the full track: the preview's start in the track plus the offset inside the preview.
export const matchedAtInTrack = (offsetSeconds, previewStartMs) =>
  Number.isFinite(offsetSeconds) ? offsetSeconds + (previewStartMs || 0) / 1000 : null

// "+1.2 %" / "−0.4 %" / "±0.0 %" for a tempo factor; "—" when unknown.
export const formatTempo = (tempoFactor) => {
  if (!Number.isFinite(tempoFactor)) return '—'
  const percent = (tempoFactor - 1) * 100
  const rounded = Math.round(percent * 10) / 10
  if (rounded === 0) return '±0.0 %'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)} %`
}
