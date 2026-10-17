// Time geometry of a track-feature-extractor ("akin") set render, mirroring
// the desktop app and the dj-automation renderer, for building ground truth.
// Intervals are [start, end] pairs in milliseconds.

// The intervals where a piecewise-linear lane ([[t, value], ...]) is above
// zero. The envelope is zero outside its drawn points.
const positiveRuns = (points) => {
  const runs = []
  for (let i = 0; i + 1 < points.length; i++) {
    const [t0, v0] = points[i]
    const [t1, v1] = points[i + 1]
    if (t1 <= t0 || (v0 <= 0 && v1 <= 0)) continue
    const last = runs[runs.length - 1]
    if (last && last[1] >= t0) last[1] = Math.max(last[1], t1)
    else runs.push([t0, t1])
  }
  return runs
}

const intersectRuns = (a, b) => {
  const out = []
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const start = Math.max(a0, b0)
      const end = Math.min(a1, b1)
      if (end > start) out.push([start, end])
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

const unionRuns = (runs) => {
  const out = []
  for (const [start, end] of [...runs].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1]
    if (last && last[1] >= start) last[1] = Math.max(last[1], end)
    else out.push([start, end])
  }
  return out
}

// Layer-side volume lane ids by stem (set_layer_automation._STEM_VOL_PARAM_A).
const STEM_VOLUME_LANE = { vocals: 'stemVoxA', drums: 'stemDrumA', bass: 'stemBassA', other: 'stemOtherA' }
STEM_VOLUME_LANE.melody = STEM_VOLUME_LANE.other

// Where a layer is audible, as fractions of its canvas window: the effective
// volume of each stem is the whole-layer `volA` lane times the stem's lane
// (store._compile_authored_layer_bundle); an unauthored factor is 1, and with
// neither authored the seed envelope spans the whole window.
const layerAudibleFractions = (lanes, stems) => {
  const runsOf = (paramId) => (lanes[paramId] ? positiveRuns(lanes[paramId]) : null)
  const whole = runsOf('volA')
  const perStem = (stems.length ? stems : [null]).map((stem) => {
    const stemRuns = stem ? runsOf(STEM_VOLUME_LANE[stem]) : null
    if (whole && stemRuns) return intersectRuns(whole, stemRuns)
    return whole || stemRuns || [[0, 1]]
  })
  return unionRuns(perStem.flat())
}

// Beat jumps (beat_jumps.py): +N bars at P cuts [P, P + N bars), -N replays
// [P - N bars, P) once. Maps an interval of the edited track back to the
// original track positions it plays, in playback order.
const editedToOriginal = ([editedStart, editedEnd], jumps, bpm) => {
  const barMs = 240000 / bpm
  const segments = []
  let cursor = 0
  for (const j of [...jumps].sort((a, b) => a.positionMs - b.positionMs)) {
    const sizeMs = Math.abs(j.sizeBars) * barMs
    if (j.positionMs > cursor) segments.push([cursor, j.positionMs])
    if (j.sizeBars > 0) {
      cursor = j.positionMs + sizeMs
    } else {
      segments.push([j.positionMs - sizeMs, j.positionMs])
      cursor = j.positionMs
    }
  }
  segments.push([cursor, Infinity])
  const out = []
  let edited = 0
  for (const [s0, s1] of segments) {
    const length = s1 - s0
    const from = Math.max(editedStart, edited)
    const to = Math.min(editedEnd, edited + length)
    if (to > from) out.push([s0 + (from - edited), s0 + (to - edited)])
    edited += length
    if (edited >= editedEnd) break
  }
  return out
}

const overlapMs = (intervals, [start, end]) =>
  unionRuns(intervals).reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, start)), 0)

module.exports = { positiveRuns, intersectRuns, unionRuns, layerAudibleFractions, editedToOriginal, overlapMs }
