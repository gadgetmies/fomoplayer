// Formats a track duration in milliseconds as `m:ss`-style text (`hh:mm:ss` with a leading `00:` dropped). Returns
// '-' when the duration is unknown: uploaded audio samples have none, and `new Date(NaN).toISOString()` throws a
// RangeError that would take down the whole player.
export const formatDuration = (durationMs) => {
  const ms = durationMs === null || durationMs === undefined || durationMs === '' ? NaN : Number(durationMs)
  if (!Number.isFinite(ms) || ms < 0) return '-'
  return new Date(ms).toISOString().substring(11, 19).replace(/^00:/, '')
}
