const assert = require('assert')
const { test } = require('cascade-test')
const { evaluate } = require('../../../scripts/dj-set/evaluate.js')

const truthPlay = ({ row, trackId, startSeconds, endSeconds, overlap = 60, ...extra }) => ({
  row,
  artist: 'Artist',
  title: `Track ${trackId}`,
  startSeconds,
  endSeconds,
  tempoFactor: 1.02,
  nativeStartSeconds: 0,
  nativeEndSeconds: endSeconds - startSeconds,
  trackIds: [trackId],
  previews: [],
  previewOverlapSeconds: overlap,
  ...extra,
})

const tracklistPlay = ({ trackId, startSeconds, endSeconds, alternates = [] }) => ({
  trackId,
  alternates,
  previewIds: [],
  name: `Track ${trackId}`,
  startSeconds,
  endSeconds,
  anchorSeconds: startSeconds,
  tempoFactor: 1.02,
  score: 20,
  windows: 3,
})


// --- pairwise alignment for synthetic sets (recogniser feasibility study) ---

// Two tracks, the second entering at set second 100 where the first reaches
// its exit cue. The incoming plays 2 % fast (tempo factor 1.02); its entry cue
// sits at file second 40, so its file start (the matcher's anchor) lands at
// set second 100 - 40 / 1.02.
const syntheticTruth = () => ({
  plays: [
    { ...truthPlay({ row: 0, trackId: 1, startSeconds: 0, endSeconds: 130 }), tempoFactor: 1.0 },
    { ...truthPlay({ row: 1, trackId: 2, startSeconds: 70, endSeconds: 300 }), tempoFactor: 1.02 },
  ],
  transitions: [
    {
      index: 0,
      outgoingRow: 0,
      incomingRow: 1,
      outgoingTrackId: 1,
      incomingTrackId: 2,
      crossoverSeconds: 100,
      outCueSeconds: 100,
      inCueSeconds: 40,
      incomingBeatSeconds: 0.5,
      base: 'fade-and-swap',
      runInBars: 16,
      tailBars: 32,
      windowStartSeconds: 70,
      windowSeconds: 90,
      soloSeconds: 10,
      lanes: { volA: [[0, 1], [0.33, 1], [1, 0]], volB: [[0, 0], [0.33, 1], [1, 1]] },
    },
  ],
})

const alignedTracklist = ({ incomingAnchor = 100 - 40 / 1.02, incomingTempo = 1.02 } = {}) => ({
  plays: [
    { ...tracklistPlay({ trackId: 1, startSeconds: 0, endSeconds: 130 }), anchorSeconds: 0, tempoFactor: 1.0 },
    {
      ...tracklistPlay({ trackId: 2, startSeconds: 70, endSeconds: 300 }),
      anchorSeconds: incomingAnchor,
      tempoFactor: incomingTempo,
    },
  ],
  windows: [{ startSeconds: 60, endSeconds: 90, rows: [{ track_id: 1, match_score: 12 }] }],
})


test({
  'counts layers like other plays and does not count a found layer as a false positive': () => {
    const truth = {
      plays: [
        truthPlay({ row: 0, trackId: 1, startSeconds: 0, endSeconds: 120 }),
        truthPlay({ row: 1, trackId: 2, startSeconds: 100, endSeconds: 220 }),
        // The vocal plays inside the preview.
        truthPlay({ row: 'L1', trackId: 3, startSeconds: 30, endSeconds: 90, layer: true, stems: 'vocals' }),
        // Only parts outside the preview play.
        truthPlay({ row: 'L2', trackId: 4, startSeconds: 150, endSeconds: 200, overlap: 0, layer: true }),
      ],
    }
    const tracklist = {
      plays: [
        tracklistPlay({ trackId: 1, startSeconds: 10, endSeconds: 110 }),
        // The layer is found through another release of the same track.
        tracklistPlay({ trackId: 30, startSeconds: 40, endSeconds: 80, alternates: [{ trackId: 3 }] }),
      ],
    }
    const { metrics, lines } = evaluate(tracklist, truth)
    assert.strictEqual(metrics.recognisable, 3)
    assert.strictEqual(metrics.found, 2)
    assert.strictEqual(metrics.correct, 2)
    assert.strictEqual(metrics.precision, 1)
    assert(lines.some((l) => l.startsWith('FOUND') && l.includes('[layer: vocals]')))
    assert(lines.some((l) => l.startsWith('MISSED') && l.includes('Track 2')))
    assert(lines.some((l) => l.startsWith('n/a') && l.includes('Track 4 [layer]')))
  },

  'scores a correctly placed pair as aligned with no error': () => {
    const { metrics, transitions } = evaluate(alignedTracklist(), syntheticTruth())
    assert.strictEqual(metrics.transitions, 1)
    assert.strictEqual(metrics.transitionsAligned, 1)
    assert.ok(Math.abs(transitions[0].errorBeats) < 1e-9)
    assert.strictEqual(transitions[0].status, 'aligned')
  },
  'measures an incoming anchor shift in beats of the incoming track': () => {
    // One beat of the incoming track in set time is 0.5 s; shifting the
    // recognised anchor 0.5 s later makes the pair one beat off.
    const { transitions } = evaluate(alignedTracklist({ incomingAnchor: 100 - 40 / 1.02 + 0.5 }), syntheticTruth())
    assert.ok(Math.abs(transitions[0].errorBeats + 1) < 1e-6, `got ${transitions[0].errorBeats}`)
    assert.strictEqual(transitions[0].status, 'off')
  },
  'a tempo error alone shows in the recognised-tempo score but not the truth-tempo one': () => {
    const { transitions } = evaluate(alignedTracklist({ incomingTempo: 1.03 }), syntheticTruth())
    assert.ok(Math.abs(transitions[0].errorBeats) > 0.1)
    assert.ok(Math.abs(transitions[0].errorBeatsTruthTempo) < 1e-9)
  },
  'a missing track leaves the transition missing': () => {
    const tracklist = alignedTracklist()
    tracklist.plays.pop()
    const { metrics, transitions } = evaluate(tracklist, syntheticTruth())
    assert.strictEqual(transitions[0].status, 'missing')
    assert.strictEqual(metrics.transitionsFound, 0)
  },
  'labels each window with the other deck level from the lanes': () => {
    const { windowLabels } = evaluate(alignedTracklist(), syntheticTruth())
    const first = windowLabels.find((l) => l.row === 0)
    // Window 60–90 overlaps the transition window from 70: the incoming deck
    // rises from 0 while the outgoing stays at full level.
    assert.strictEqual(first.matchScore, 12)
    assert.ok(first.meanOwnLevel > 0.99)
    assert.ok(first.maxOtherLevel > 0.5 && first.meanOtherLevel < 0.5, JSON.stringify(first))
  },

  'scores a pair whose incoming play is only detected well after the crossover': () => {
    // The incoming track is mixed in quietly: the matcher sees it from 140 s,
    // 40 s after the crossover, but its anchor is still right.
    const tracklist = alignedTracklist()
    tracklist.plays[1].startSeconds = 140
    const { transitions } = evaluate(tracklist, syntheticTruth())
    assert.strictEqual(transitions[0].status, 'aligned')
    assert.ok(Math.abs(transitions[0].errorBeats) < 1e-9)
  },
})
