// Turns per-window match rows into a tracklist.
//
// A detection says: in this window the preview plays at tempo factor `a`
// with preview_pos = a · set_pos + b. Every window that hears the same play
// of a track agrees on where that play's preview position 0 falls in the set,
// set_anchor = −b / a, even when another track plays over it — so detections
// are chained per preview by anchor and tempo, not by window adjacency. The
// anchor is robust to the tempo grid step: an error δ in `a` moves it by
// about preview_pos · δ, under a second for a two-minute preview.

const DEFAULTS = {
  anchorToleranceSeconds: 3, // detections of one play agree on the anchor within this
  tempoTolerance: 0.02, // and on the tempo factor within this
  minWindows: 2, // a play needs this many windows ...
  minSingleWindowScore: 12, // ... unless one window alone scores at least this
  minTotalScore: 8, // and the summed peak counts must reach this
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// windows: [{ startSeconds, endSeconds, rows: [matcher rows] }]
const detectionsFromWindows = (windows) =>
  windows.flatMap((w) =>
    w.rows.map((row) => ({
      previewId: Number(row.store__track_preview_id),
      trackId: Number(row.track_id),
      tempoFactor: row.peak_tempo_factor,
      anchorSeconds: -row.peak_offset_seconds / row.peak_tempo_factor,
      score: row.match_score,
      windowStart: w.startSeconds,
      windowEnd: w.endSeconds,
    })),
  )

// Groups one preview's detections into plays.
const clusterPreview = (detections, { anchorToleranceSeconds, tempoTolerance }) => {
  const sorted = [...detections].sort((a, b) => a.anchorSeconds - b.anchorSeconds)
  const clusters = []
  for (const d of sorted) {
    const cluster = clusters.find(
      (c) =>
        Math.abs(median(c.map((x) => x.anchorSeconds)) - d.anchorSeconds) <= anchorToleranceSeconds &&
        Math.abs(median(c.map((x) => x.tempoFactor)) - d.tempoFactor) <= tempoTolerance,
    )
    if (cluster) cluster.push(d)
    else clusters.push([d])
  }
  return clusters
}

const playFromCluster = (cluster) => {
  const windowStarts = [...new Set(cluster.map((d) => d.windowStart))]
  return {
    trackId: cluster[0].trackId,
    previewIds: [...new Set(cluster.map((d) => d.previewId))],
    startSeconds: Math.min(...cluster.map((d) => d.windowStart)),
    endSeconds: Math.max(...cluster.map((d) => d.windowEnd)),
    anchorSeconds: median(cluster.map((d) => d.anchorSeconds)),
    tempoFactor: median(cluster.map((d) => d.tempoFactor)),
    score: cluster.reduce((sum, d) => sum + d.score, 0),
    maxWindowScore: Math.max(...cluster.map((d) => d.score)),
    windows: windowStarts.length,
  }
}

const accepted = (play, { minWindows, minSingleWindowScore, minTotalScore }) =>
  play.score >= minTotalScore && (play.windows >= minWindows || play.maxWindowScore >= minSingleWindowScore)

// The same recording is often released several times (one preview each);
// plays of one track that overlap in the set are one play.
const mergeSameTrack = (plays) => {
  const byTrack = new Map()
  for (const play of plays) {
    if (!byTrack.has(play.trackId)) byTrack.set(play.trackId, [])
    byTrack.get(play.trackId).push(play)
  }
  const merged = []
  for (const trackPlays of byTrack.values()) {
    trackPlays.sort((a, b) => a.startSeconds - b.startSeconds)
    let current = null
    for (const play of trackPlays) {
      if (current && play.startSeconds <= current.endSeconds) {
        const best = play.score > current.score ? play : current
        current = {
          ...best,
          previewIds: [...new Set([...current.previewIds, ...play.previewIds])],
          startSeconds: Math.min(current.startSeconds, play.startSeconds),
          endSeconds: Math.max(current.endSeconds, play.endSeconds),
          score: current.score + play.score,
          maxWindowScore: Math.max(current.maxWindowScore, play.maxWindowScore),
          windows: Math.max(current.windows, play.windows),
        }
      } else {
        if (current) merged.push(current)
        current = play
      }
    }
    merged.push(current)
  }
  return merged
}

module.exports.stitch = (windows, options = {}) => {
  const params = { ...DEFAULTS, ...options }
  const byPreview = new Map()
  for (const d of detectionsFromWindows(windows)) {
    if (!byPreview.has(d.previewId)) byPreview.set(d.previewId, [])
    byPreview.get(d.previewId).push(d)
  }
  const plays = [...byPreview.values()]
    .flatMap((detections) => clusterPreview(detections, params))
    .map(playFromCluster)
    .filter((play) => accepted(play, params))
  return mergeSameTrack(plays).sort((a, b) => a.startSeconds - b.startSeconds)
}

module.exports.STITCH_DEFAULTS = DEFAULTS
