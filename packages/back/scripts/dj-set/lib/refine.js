// Re-scores candidate plays over their whole span.
//
// Window scores overlap: with 30 s windows every 10 s, each matched pair is
// counted in up to three windows, so a handful of coincidental pairs looks
// like a three-window play. Refinement takes all set fingerprints in the
// play's span, the candidate preview's rows for those hashes (from the local
// mirror), and finds the tempo on a fine grid whose offset clusters hold the
// most set fingerprints — each counted at most once. Several clusters may
// count: a play can be split into segments by loops and beat jumps. The
// aligned fingerprints also give the play's real extent in the set and a
// precise tempo factor.
//
// Plays whose aligned set fingerprints are mostly the same as a stronger
// play's are the same audio under another release (a remaster, a DJ-mix
// compilation version, an edit) and become that play's alternates; two
// tracks overlapping in a transition share almost no aligned fingerprints.

const sql = require('sql-template-strings')

const DEFAULTS = {
  marginSeconds: 15, // span widened by this on both sides
  // ± around the window estimate, clamped to the matcher range: the whole
  // range, since a candidate's windows can settle on a noise tempo.
  tempoSearch: 0.16,
  tempoStep: 0.001,
  maxTempoDeviation: 0.08, // never beyond the matcher's range
  bucketSeconds: 0.5,
  segmentMin: 4, // aligned set fingerprints for an offset cluster to count
  minRefinedScore: 6, // aligned set fingerprints needed for a play
  minSignificance: 10, // −log10 chance of the play's strongest segment
  alternateOverlap: 0.2, // share of aligned fingerprints that makes an alternate
  maxConcurrent: 3, // tracks audible at once in a DJ set
}

// Groups pairs by offset bucket at tempo `a`. A true alignment can straddle
// a bucket edge, so a second grid shifted by half a bucket is added; the
// sequential-segment pass keeps only one of two overlapping clusters.
// (Merging neighbouring buckets instead would chain without limit: at a
// wrong tempo the pairs drift smoothly across buckets into one long cluster.)
const offsetClusters = (pairs, a, bucketSeconds) => {
  const clusters = []
  for (const phase of [0, 0.5]) {
    const byBucket = new Map()
    for (const pr of pairs) {
      const b = Math.floor((pr.p - a * pr.s) / bucketSeconds + phase)
      if (!byBucket.has(b)) byBucket.set(b, { offsetSeconds: (b + 0.5 - phase) * bucketSeconds, pairs: [] })
      byBucket.get(b).pairs.push(pr)
    }
    for (const { offsetSeconds, pairs: members } of byBucket.values()) {
      const indexes = new Set(members.map((pr) => pr.i))
      const residuals = members.map((pr) => pr.p - a * pr.s)
      const mean = residuals.reduce((sum, r) => sum + r, 0) / residuals.length
      // Residual spread: within the plateau of tempos that keep the pairs in
      // one bucket, the true tempo lines them up tightest.
      const spread = residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / residuals.length
      // Robust set-time extent: a stray pair should not stretch a segment.
      const times = members.map((pr) => pr.s).sort((x, y) => x - y)
      clusters.push({
        offsetSeconds,
        spread,
        indexes,
        from: times[Math.floor(times.length * 0.1)],
        to: times[Math.ceil(times.length * 0.9) - 1],
      })
    }
  }
  return clusters
}

// Segments of one play follow each other in set time (a loop or a beat jump
// moves the offset, not the clock). Clusters that cover the same stretch of
// set time instead come from material repeating inside the preview — a drum
// break matching once per bar — and only the strongest of them counts.
const sequentialSegments = (clusters, segmentMin) => {
  const chosen = []
  for (const c of clusters
    .filter((x) => x.indexes.size >= segmentMin)
    .sort((x, y) => y.indexes.size - x.indexes.size)) {
    const clash = chosen.some((o) => {
      const overlap = Math.min(o.to, c.to) - Math.max(o.from, c.from)
      return overlap > 0.3 * Math.max(1, Math.min(o.to - o.from, c.to - c.from))
    })
    if (!clash) chosen.push(c)
  }
  return chosen
}

// The tempo at which the evidence is sharpest: near the true tempo the
// pairs merely redistribute between clusters, so the total barely moves,
// but the largest cluster peaks. The play's score is then the sum over its
// sequential segments at that tempo — a play can be split by loops and
// beat jumps (same tempo, new offset).
const bestTempo = (pairs, centre, { tempoSearch, tempoStep, bucketSeconds, segmentMin, maxTempoDeviation }) => {
  let best = { peak: 0, score: 0, spread: Infinity, tempoFactor: centre, segments: [] }
  const steps = Math.round(tempoSearch / tempoStep)
  for (let k = -steps; k <= steps; k++) {
    const a = centre + k * tempoStep
    if (Math.abs(a - 1) > maxTempoDeviation + 1e-9) continue
    const segments = sequentialSegments(offsetClusters(pairs, a, bucketSeconds), segmentMin)
    const peak = segments.length ? segments[0].indexes.size : 0
    const spread = segments.length ? segments[0].spread : Infinity
    const score = segments.reduce((sum, c) => sum + c.indexes.size, 0)
    // Peak first, then the tightest alignment: a slightly wrong tempo smears
    // the pairs and can grow spurious extra segments, so total score is
    // only the last resort.
    const better =
      peak > best.peak ||
      (peak === best.peak && (spread < best.spread || (spread === best.spread && score > best.score)))
    if (better) best = { peak, score, spread, tempoFactor: a, segments }
  }
  return best
}

const refinePlay = async (mirror, setFingerprints, play, params) => {
  const from = play.startSeconds - params.marginSeconds
  const to = play.endSeconds + params.marginSeconds
  const span = []
  setFingerprints.forEach((fp, i) => {
    if (fp.position >= from && fp.position < to) span.push({ i, hash: String(fp.hash), s: fp.position })
  })
  if (span.length === 0) return null
  const rows = await mirror.queryRowsAsync(sql`
    SELECT store__track_preview_id, store__track_preview_fingerprint_hash::TEXT AS hash
         , store__track_preview_fingerprint_position AS position
    FROM store__track_preview_fingerprint
    WHERE store__track_preview_id = ANY(${play.previewIds}::BIGINT[])
      AND store__track_preview_fingerprint_hash = ANY(${[...new Set(span.map((f) => f.hash))]}::BIGINT[])`)
  let best = null
  for (const previewId of play.previewIds) {
    const byHash = new Map()
    for (const r of rows) {
      if (Number(r.store__track_preview_id) !== Number(previewId)) continue
      if (!byHash.has(r.hash)) byHash.set(r.hash, [])
      byHash.get(r.hash).push(r.position)
    }
    const pairs = span.flatMap((f) => (byHash.get(f.hash) || []).map((p) => ({ i: f.i, s: f.s, p })))
    const tempo = bestTempo(pairs, play.tempoFactor, params)
    if (!best || tempo.score > best.tempo.score) best = { previewId, tempo, pairs, pairCount: pairs.length }
  }
  if (!best || best.tempo.score === 0) return null
  const offsets = best.pairs.map((pr) => pr.p - best.tempo.tempoFactor * pr.s)
  const alignedIndexes = [...new Set(best.tempo.segments.flatMap((c) => [...c.indexes]))]
  const positions = alignedIndexes.map((i) => setFingerprints[i].position)
  // The strongest segment's offset gives the anchor (preview 0 s in the set).
  const { offsetSeconds } = best.tempo.segments[0]
  return {
    ...play,
    previewId: best.previewId,
    tempoFactor: best.tempo.tempoFactor,
    anchorSeconds: -offsetSeconds / best.tempo.tempoFactor,
    windowScore: play.score,
    score: best.tempo.score,
    segments: best.tempo.segments.length,
    peak: best.tempo.segments[0].indexes.size,
    pairCount: best.pairCount,
    offsetRangeSeconds: Math.max(...offsets) - Math.min(...offsets) + params.bucketSeconds,
    spanSeconds: to - from,
    startSeconds: Math.min(...positions),
    endSeconds: Math.max(...positions),
    alignedIndexes,
  }
}

// log10 of the Poisson upper tail P(X ≥ k) for mean `lambda`, in log space
// so strong peaks do not underflow to 0.
const log10PoissonTail = (k, lambda) => {
  if (k <= 0) return 0
  let logFactorial = 0
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i)
  const logs = []
  let logTerm = -lambda + k * Math.log(lambda) - logFactorial
  for (let i = k; i < k + 200; i++) {
    logs.push(logTerm)
    logTerm += Math.log(lambda) - Math.log(i + 1)
  }
  const max = Math.max(...logs)
  return (max + Math.log(logs.reduce((sum, l) => sum + Math.exp(l - max), 0))) / Math.LN10
}

// How surprising the play's strongest segment is: its pairs against the
// chance level of a bucket when the candidate's pairs spread evenly over
// the offsets they cover. Previews that share a lot of material with the set
// (a common break, a sampled vocal) produce many pairs and so a high chance
// level; a real play concentrates its pairs in one cell.
const significance = (play, bucketSeconds) => {
  const lambda = Math.max(1e-6, (play.pairCount * bucketSeconds) / Math.max(10, play.offsetRangeSeconds))
  return -log10PoissonTail(play.peak, lambda)
}

const overlapSeconds = (a, b) =>
  Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds))

// Share of `play`'s span during which at least `limit` accepted plays sound.
const crowdedShare = (play, accepted, limit) => {
  const length = Math.max(1, play.endSeconds - play.startSeconds)
  let crowded = 0
  for (let t = play.startSeconds; t < play.endSeconds; t += 1) {
    const playing = accepted.filter((p) => p.startSeconds <= t && t < p.endSeconds).length
    if (playing >= limit) crowded += 1
  }
  return crowded / length
}

module.exports.refine = async (mirror, setFingerprints, plays, options = {}) => {
  const params = { ...DEFAULTS, ...options }
  const refined = []
  for (const play of plays) {
    const r = await refinePlay(mirror, setFingerprints, play, params)
    if (!r) continue
    r.significance = significance(r, params.bucketSeconds)
    if (r.score >= params.minRefinedScore && r.significance >= params.minSignificance) refined.push(r)
  }
  // Most significant first. A weaker play overlapping a stronger one that
  // shares much of its aligned fingerprints is the same audio (a remaster, a
  // DJ-mix compilation version, an edit) and becomes an alternate. A play
  // that would be one track too many — more than a DJ plays at once — is a
  // shared sample, not a track.
  refined.sort((a, b) => b.significance - a.significance)
  const accepted = []
  for (const play of refined) {
    const own = new Set(play.alignedIndexes)
    const parent = accepted.find((p) => {
      if (overlapSeconds(p, play) < 0.5 * (play.endSeconds - play.startSeconds)) return false
      const shared = p.alignedIndexes.filter((i) => own.has(i)).length
      return shared >= params.alternateOverlap * own.size
    })
    if (parent) {
      const known = parent.trackId === play.trackId || parent.alternates.some((a) => a.trackId === play.trackId)
      if (!known) parent.alternates.push({ trackId: play.trackId, previewId: play.previewId, score: play.score })
      continue
    }
    if (crowdedShare(play, accepted, params.maxConcurrent) > 0.5) continue
    accepted.push({ ...play, alternates: [] })
  }
  return accepted
    .map(({ alignedIndexes, ...play }) => ({ ...play, alignedCount: alignedIndexes.length }))
    .sort((a, b) => a.startSeconds - b.startSeconds)
}

module.exports.REFINE_DEFAULTS = DEFAULTS

// Exposed for unit tests.
module.exports.internals = { bestTempo, log10PoissonTail, sequentialSegments, offsetClusters }
