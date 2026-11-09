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
//
// Usage:
//   node scripts/dj-set/evaluate.js --tracklist=set.tracklist.json --truth=set.truth.json [--min-overlap=10] [--json]

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
    },
  }
}

module.exports.evaluate = evaluate

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.tracklist || !args.truth) {
    console.error('usage: evaluate.js --tracklist=<file> --truth=<file> [--min-overlap=10] [--json]')
    process.exit(1)
  }
  const { lines, metrics } = evaluate(
    JSON.parse(fs.readFileSync(args.tracklist, 'utf8')),
    JSON.parse(fs.readFileSync(args.truth, 'utf8')),
    { minOverlapSeconds: args['min-overlap'] === undefined ? 10 : Number(args['min-overlap']) },
  )
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
  }
}
