const R = require('ramda')

const mapTrack = (t) => ({
  title: t.title,
  version: t.version || null,
  id: t.id || t.store_track_id,
  url: t.url,
  artists: t.artists || [],
  genres: (t.genres || []).map((g) => ({ name: g.name, id: g.id || null, url: g.url || null })),
  duration_ms: t.duration_ms,
  release: t.release
    ? {
        id: t.release.id,
        title: t.release.title,
        url: t.release.url,
        catalog_number: t.release.catalog_number || null,
      }
    : null,
  released: t.release?.released || null,
  published: t.published || null,
  previews:
    t.preview_url || (t.previews && t.previews.length)
      ? [
          {
            format: 'mp3',
            url: t.preview_url || (t.previews && t.previews[0] && t.previews[0].url),
            start_ms: (t.previews && t.previews[0] && t.previews[0].start_ms) ?? 0,
            end_ms:
              (t.previews && t.previews[0] && t.previews[0].end_ms) ?? t.duration_ms ?? null,
          },
        ].filter((p) => p.url)
      : [],
  label: t.label ? { id: t.label.id, name: t.label.name, url: t.label.url } : null,
  waveform: t.waveform || null,
  key: t.key || null,
  bpm: t.bpm != null ? t.bpm : null,
  isrc: t.isrc || null,
  track_number: t.track_number,
  store_details: t.store_details || [],
})

module.exports.junodownloadReleasesTransform = (releases) => {
  if (!Array.isArray(releases)) return []
  return R.chain((r) => (r.tracks || []).map(mapTrack), releases)
}

module.exports.junodownloadTrackTransform = mapTrack
