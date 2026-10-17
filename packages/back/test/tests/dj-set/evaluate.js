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
})
