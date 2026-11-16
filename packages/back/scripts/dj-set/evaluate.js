#!/usr/bin/env node

// Scores a tracklist (tracklist.js) against ground truth (truth-from-akin.js).
//
// - A tracklist play names a track and its alternates; either may match.
// - Recall counts the truth plays that are recognisable at all: the played
//   part of the track overlaps a fingerprinted preview by at least
//   --min-overlap seconds. A play is found when the tracklist has one of its
//   track ids overlapping its interval in the set.
// - Layers (a track or its stems played over another track) count like any
//   other play; they are tagged in the report.
// - Precision counts tracklist plays that overlap a truth play of the same
//   track.
// - Anchor error compares where the preview's first second lands in the set
//   (predicted vs truth); tempo error compares the tempo factors.
// - A truth file that lists `transitions` (the recogniser feasibility study's
//   synthetic sets) also gets the pairwise alignment score: when the
//   recognised outgoing track reaches its exit cue, how far the recognised
//   incoming track is from its entry cue, in beats of the incoming track — the
//   error a reconstruction beatmatching the pair would make. No global clock
//   is involved, so a set whose tempo wanders costs nothing as long as each
//   pair lines up. `--report=<file>` writes the per-play, per-transition and
//   per-window details (the other deck's level in every matcher window) as JSON.
//
// Usage:
//   node scripts/dj-set/evaluate.js --tracklist=set.tracklist.json --truth=set.truth.json \
//     [--min-overlap=10] [--json] [--report=<file>]

const fs = require('fs')
const { parseArgs } = require('./lib/args')

// A play names its track plus alternates — other releases of the same audio
// (a remaster, a DJ-mix compilation version) the matcher could not tell apart.
const playTrackIds = (play) => [play.trackId, ...(play.alternates || []).map((a) => a.trackId)]
const matches = (play, truthPlay) => playTrackIds(play).some((id) => truthPlay.trackIds.includes(id))

const overlaps = (a, b, slack) => a.startSeconds < b.endSeconds + slack && b.startSeconds < a.endSeconds + slack

// Where preview position 0 of `preview` plays in the set, per the truth.
const truthAnchor = (play, preview) =>
  play.startSeconds + (preview.startSeconds - play.nativeStartSeconds) / play.tempoFactor

const median = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const evaluate = (tracklist, truth, { minOverlapSeconds = 10, slackSeconds = 15 } = {}) => {
  const lines = []
  const anchorErrors = []
  const tempoErrors = []
  let recognisable = 0
  let found = 0
  for (const t of truth.plays) {
    const isRecognisable = t.previewOverlapSeconds >= minOverlapSeconds
    const hit = tracklist.plays.find((p) => matches(p, t) && overlaps(p, t, slackSeconds))
    if (isRecognisable) recognisable++
    if (isRecognisable && hit) found++
    let detail = ''
    if (hit) {
      // The anchor is where the start of the play's best preview lands.
      const preview = t.previews.find(
        (pr) => pr.previewId === (hit.previewId ?? hit.previewIds[0]) && pr.startSeconds !== null,
      )
      if (preview) {
        const error = hit.anchorSeconds - truthAnchor(t, preview)
        anchorErrors.push(error)
        detail += ` anchor ${error >= 0 ? '+' : ''}${error.toFixed(1)} s`
      }
      const tempoError = hit.tempoFactor - t.tempoFactor
      tempoErrors.push(tempoError)
      detail += ` tempo ${hit.tempoFactor.toFixed(3)} (truth ${t.tempoFactor.toFixed(3)})`
    }
    const status = hit ? 'FOUND' : isRecognisable ? 'MISSED' : 'n/a'
    const overlap = t.previewOverlapSeconds.toFixed(0).padStart(3)
    const kind = t.layer ? ` [layer${t.stems ? `: ${t.stems}` : ''}]` : t.beatJumps ? ' [beat jumps]' : ''
    lines.push(
      `${status.padEnd(6)} ${String(t.row).padStart(3)} ${t.startSeconds.toFixed(0).padStart(5)}–${t.endSeconds
        .toFixed(0)
        .padEnd(5)} overlap ${overlap} s  ${t.artist} – ${t.title}${kind}${detail}`,
    )
  }
  const falsePositives = tracklist.plays.filter(
    (p) => !truth.plays.some((t) => matches(p, t) && overlaps(p, t, slackSeconds)),
  )
  for (const p of falsePositives) {
    lines.push(
      `FALSE  ${p.startSeconds.toFixed(0).padStart(8)}–${p.endSeconds.toFixed(0).padEnd(5)} score ${p.score} ` +
        `(${p.windows} win) ${p.name} [track ${p.trackId}]`,
    )
  }
  const correct = tracklist.plays.length - falsePositives.length
  const transitions = truth.transitions ? alignTransitions(tracklist, truth, { slackSeconds }) : null
  if (transitions) {
    for (const tr of transitions) {
      const err = tr.errorBeats === null ? 'missing' : `${tr.errorBeats >= 0 ? '+' : ''}${tr.errorBeats.toFixed(2)} beats`
      lines.push(
        `${tr.status.padEnd(8)} gap ${String(tr.index).padStart(2)} @ ${tr.crossoverSeconds.toFixed(0).padStart(5)} s ` +
          `${tr.base} run-in ${tr.runInBars} tail ${tr.tailBars} solo ${tr.soloSeconds === null ? '—' : tr.soloSeconds.toFixed(1)} s  ${err}`,
      )
    }
  }
  const aligned = transitions ? transitions.filter((t) => t.status === 'aligned') : []
  const foundTransitions = transitions ? transitions.filter((t) => t.errorBeats !== null) : []
  return {
    lines,
    metrics: {
      recognisable,
      found,
      recall: recognisable ? found / recognisable : null,
      reported: tracklist.plays.length,
      correct,
      precision: tracklist.plays.length ? correct / tracklist.plays.length : null,
      medianAnchorErrorSeconds: median(anchorErrors),
      medianAbsAnchorErrorSeconds: median(anchorErrors.map(Math.abs)),
      medianAbsTempoError: median(tempoErrors.map(Math.abs)),
      ...(transitions && {
        transitions: transitions.length,
        transitionsFound: foundTransitions.length,
        transitionsAligned: aligned.length,
        alignedShare: transitions.length ? aligned.length / transitions.length : null,
        medianAbsAlignBeats: median(foundTransitions.map((t) => Math.abs(t.errorBeats))),
        medianAbsAlignBeatsTruthTempo: median(foundTransitions.map((t) => Math.abs(t.errorBeatsTruthTempo))),
      }),
    },
    transitions,
    windowLabels: truth.transitions ? windowLabels(tracklist, truth) : null,
  }
}

// --- pairwise alignment (synthetic sets with a `transitions` list) ----------

// Lane value at normalised time t (flat outside the points).
const laneValue = (points, t) => {
  if (!points || points.length === 0) return null
  if (t <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1]
    const [t1, v1] = points[i]
    if (t0 <= t && t <= t1) return t1 === t0 ? v0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
  }
  return points[points.length - 1][1]
}

// The deck levels (0..1) of a transition at set time t: A = outgoing, B = incoming.
const transitionLevels = (tr, t) => {
  const frac = (t - tr.windowStartSeconds) / tr.windowSeconds
  return { a: laneValue(tr.lanes.volA, frac), b: laneValue(tr.lanes.volB, frac) }
}

// The recognised play of `trackId` that overlaps the truth play's span; the
// strongest when several do. The play need not cover the crossover: a track
// mixed in quietly is only matched once it is loud enough, but its anchor and
// tempo still say where its file start lies, so the pair can be scored.
const playOf = (tracklist, trackId, truthPlay, slack) =>
  tracklist.plays
    .filter((p) => playTrackIds(p).includes(trackId) && overlaps(p, truthPlay, slack))
    .sort((a, b) => b.score - a.score)[0] || null

// Where the file's start lands in the set: the fine (median-residual) anchor
// when the refinement produced one, else the bucketed anchor.
const anchorOf = (play) => (play.fineAnchorSeconds === undefined ? play.anchorSeconds : play.fineAnchorSeconds)

// File seconds of a recognised play at set time t (the whole file is its preview).
const recognisedNative = (play, t, tempoFactor = play.tempoFactor) => (t - anchorOf(play)) * tempoFactor

const alignTransitions = (tracklist, truth, { slackSeconds }) =>
  truth.transitions.map((tr) => {
    const truthOut = truth.plays[tr.outgoingRow]
    const truthIn = truth.plays[tr.incomingRow]
    const out = playOf(tracklist, tr.outgoingTrackId, truthOut, slackSeconds)
    const inc = playOf(tracklist, tr.incomingTrackId, truthIn, slackSeconds)
    const result = {
      index: tr.index,
      crossoverSeconds: tr.crossoverSeconds,
      base: tr.base,
      runInBars: tr.runInBars,
      tailBars: tr.tailBars,
      soloSeconds: tr.soloSeconds ?? null,
      soloTargetSeconds: tr.soloTargetSeconds ?? null,
      outgoingFound: Boolean(out),
      incomingFound: Boolean(inc),
      errorBeats: null,
      errorBeatsTruthTempo: null,
      errorSeconds: null,
      status: 'missing',
    }
    if (!out || !inc) return result
    // Set time at which the recognised outgoing track reaches its exit cue…
    const tStar = anchorOf(out) + tr.outCueSeconds / out.tempoFactor
    // …and where the recognised incoming track is then, against its entry cue.
    const errorSeconds = recognisedNative(inc, tStar) - tr.inCueSeconds
    // In beats of the incoming track: file seconds -> set seconds -> beats.
    const errorBeats = errorSeconds / truthIn.tempoFactor / tr.incomingBeatSeconds
    // The same with the truth tempos (only the recognised anchors count).
    const tStarTruth = anchorOf(out) + tr.outCueSeconds / truthOut.tempoFactor
    const errorTruthTempo =
      (recognisedNative(inc, tStarTruth, truthIn.tempoFactor) - tr.inCueSeconds) / truthIn.tempoFactor / tr.incomingBeatSeconds
    return {
      ...result,
      errorSeconds,
      errorBeats,
      errorBeatsTruthTempo: errorTruthTempo,
      outgoingTempoError: out.tempoFactor - truthOut.tempoFactor,
      incomingTempoError: inc.tempoFactor - truthIn.tempoFactor,
      status: Math.abs(errorBeats) <= 0.5 ? 'aligned' : 'off',
    }
  })

// For every matcher window and truth play it overlaps: the play's own deck
// level and the other deck's level over the window (mean and max, sampled per
// second from the transition lanes; 1 and 0 while the track plays alone), and
// the window's match score for that track.
const windowLabels = (tracklist, truth) => {
  const labels = []
  const byIn = new Map(truth.transitions.map((tr) => [tr.incomingRow, tr]))
  const byOut = new Map(truth.transitions.map((tr) => [tr.outgoingRow, tr]))
  for (const t of truth.plays) {
    const into = byIn.get(t.row)
    const outOf = byOut.get(t.row)
    for (const w of tracklist.windows || []) {
      const from = Math.max(w.startSeconds, t.startSeconds)
      const to = Math.min(w.endSeconds, t.endSeconds)
      if (to - from < 1) continue
      const own = []
      const other = []
      for (let s = from; s < to; s += 1) {
        let o = 1
        let x = 0
        if (into && s < into.windowStartSeconds + into.windowSeconds) {
          const l = transitionLevels(into, s)
          o = l.b
          x = Math.max(x, l.a)
        }
        if (outOf && s >= outOf.windowStartSeconds) {
          const l = transitionLevels(outOf, s)
          o = Math.min(o, l.a)
          x = Math.max(x, l.b)
        }
        own.push(o)
        other.push(x)
      }
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
      const row = (w.rows || []).find((r) => t.trackIds.includes(Number(r.track_id)))
      labels.push({
        row: t.row,
        trackId: t.trackIds[0],
        windowStartSeconds: w.startSeconds,
        seconds: to - from,
        meanOwnLevel: mean(own),
        meanOtherLevel: mean(other),
        maxOtherLevel: Math.max(...other),
        matchScore: row ? row.match_score : 0,
        matched: Boolean(row),
      })
    }
  }
  return labels
}

module.exports.evaluate = evaluate

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.tracklist || !args.truth) {
    console.error('usage: evaluate.js --tracklist=<file> --truth=<file> [--min-overlap=10] [--json]')
    process.exit(1)
  }
  const { lines, metrics, transitions, windowLabels: labels } = evaluate(
    JSON.parse(fs.readFileSync(args.tracklist, 'utf8')),
    JSON.parse(fs.readFileSync(args.truth, 'utf8')),
    { minOverlapSeconds: args['min-overlap'] === undefined ? 10 : Number(args['min-overlap']) },
  )
  if (args.report) {
    fs.writeFileSync(args.report, JSON.stringify({ metrics, lines, transitions, windowLabels: labels }, null, 1))
  }
  if (args.json) {
    console.log(JSON.stringify(metrics))
  } else {
    lines.forEach((l) => console.log(l))
    const pct = (v) => (v === null ? '—' : `${(v * 100).toFixed(0)} %`)
    console.log(
      `\nrecall ${metrics.found}/${metrics.recognisable} (${pct(metrics.recall)})  ` +
        `precision ${metrics.correct}/${metrics.reported} (${pct(metrics.precision)})  ` +
        `median anchor error ${metrics.medianAnchorErrorSeconds?.toFixed(1)} s ` +
        `(|${metrics.medianAbsAnchorErrorSeconds?.toFixed(1)}| s)  ` +
        `median tempo error ${metrics.medianAbsTempoError?.toFixed(4)}`,
    )
    if (metrics.transitions !== undefined) {
      console.log(
        `transitions aligned within ½ beat ${metrics.transitionsAligned}/${metrics.transitions} (${pct(metrics.alignedShare)}), ` +
          `found ${metrics.transitionsFound}, median |error| ${metrics.medianAbsAlignBeats?.toFixed(2)} beats ` +
          `(${metrics.medianAbsAlignBeatsTruthTempo?.toFixed(2)} with the true tempos)`,
      )
    }
  }
}
