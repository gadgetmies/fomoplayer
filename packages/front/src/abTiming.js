// Aligned A/B playback of a sample (A) and a fingerprint match (B). The matcher's model is
// preview_time = offset + tempoFactor · sample_time, with both times in seconds of the respective audio files.

export const hasAlignment = (pair) =>
  Number.isFinite(pair?.offsetSeconds) && Number.isFinite(pair?.tempoFactor) && pair.tempoFactor > 0

// Where B should play from when switching from A at `sampleTime`.
export const previewTimeForSampleTime = (pair, sampleTime) =>
  hasAlignment(pair) ? Math.max(0, pair.offsetSeconds + pair.tempoFactor * sampleTime) : 0

// Where A should play from when switching from B at `previewTime`, clamped to the sample.
export const sampleTimeForPreviewTime = (pair, previewTime, sampleDuration = Infinity) => {
  if (!hasAlignment(pair)) return 0
  const t = (previewTime - pair.offsetSeconds) / pair.tempoFactor
  return Math.min(Math.max(0, t), Number.isFinite(sampleDuration) ? sampleDuration : t)
}

// The part of B the sample matched: [start, end] in preview seconds, or null without alignment or duration.
export const loopRegion = (pair, sampleDuration) => {
  if (!hasAlignment(pair) || !(sampleDuration > 0)) return null
  return { start: pair.offsetSeconds, end: pair.offsetSeconds + pair.tempoFactor * sampleDuration }
}

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
