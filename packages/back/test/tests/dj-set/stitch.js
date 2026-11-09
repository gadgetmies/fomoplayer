const assert = require('assert')
const { test } = require('cascade-test')
const { stitch } = require('../../../scripts/dj-set/lib/stitch.js')

// A matcher row for a preview heard at `setSeconds` (window centre) while
// preview position `previewSeconds` plays, at tempo factor `tempo`:
// preview_pos = tempo · set_pos + offset.
const row = ({ previewId, trackId = previewId, setSeconds, previewSeconds, tempo = 1, score = 10 }) => ({
  store__track_preview_id: previewId,
  track_id: trackId,
  peak_tempo_factor: tempo,
  peak_offset_seconds: previewSeconds - tempo * setSeconds,
  match_score: score,
})

const windowAt = (startSeconds, rows) => ({ startSeconds, endSeconds: startSeconds + 30, rows })

test({
  'chains the windows of one play into one entry': () => {
    const windows = [0, 10, 20, 30].map((start) =>
      windowAt(start, [
        row({ previewId: 1, setSeconds: start + 15, previewSeconds: 40 + (start + 15) * 1.04, tempo: 1.04 }),
      ]),
    )
    const plays = stitch(windows)
    assert.strictEqual(plays.length, 1)
    assert.strictEqual(plays[0].trackId, 1)
    assert.strictEqual(plays[0].windows, 4)
    assert.strictEqual(plays[0].startSeconds, 0)
    assert.strictEqual(plays[0].endSeconds, 60)
    assert(Math.abs(plays[0].tempoFactor - 1.04) < 1e-9)
  },

  'reports both tracks of a transition': () => {
    // Track 1 plays until ~70 s, track 2 from ~40 s: windows 40–60 hear both.
    const windows = [0, 10, 20, 30, 40, 50, 60, 70, 80].map((start) => {
      const centre = start + 15
      const rows = []
      if (centre <= 70) rows.push(row({ previewId: 1, setSeconds: centre, previewSeconds: centre, score: 12 }))
      if (centre >= 40) rows.push(row({ previewId: 2, setSeconds: centre, previewSeconds: centre - 40, score: 6 }))
      return windowAt(start, rows)
    })
    const plays = stitch(windows)
    assert.deepStrictEqual(
      plays.map((p) => p.trackId),
      [1, 2],
    )
    assert(plays[0].endSeconds > plays[1].startSeconds, 'the plays overlap')
  },

  'keeps two separate plays of one track apart': () => {
    const windows = [0, 10, 200, 210].map((start) =>
      windowAt(start, [
        row({ previewId: 1, setSeconds: start + 15, previewSeconds: start < 100 ? start + 15 : start - 185 }),
      ]),
    )
    const plays = stitch(windows)
    assert.strictEqual(plays.length, 2)
  },

  'drops a single weak window': () => {
    const plays = stitch([windowAt(0, [row({ previewId: 1, setSeconds: 15, previewSeconds: 15, score: 5 })])])
    assert.strictEqual(plays.length, 0)
  },

  'keeps a single strong window': () => {
    const plays = stitch([windowAt(0, [row({ previewId: 1, setSeconds: 15, previewSeconds: 15, score: 30 })])])
    assert.strictEqual(plays.length, 1)
  },

  'merges overlapping plays of one track found through different releases': () => {
    const windows = [0, 10, 20].map((start) =>
      windowAt(start, [
        row({ previewId: 1, trackId: 7, setSeconds: start + 15, previewSeconds: start + 15 }),
        row({ previewId: 2, trackId: 7, setSeconds: start + 15, previewSeconds: start + 5 }),
      ]),
    )
    const plays = stitch(windows)
    assert.strictEqual(plays.length, 1)
    assert.deepStrictEqual(plays[0].previewIds.sort(), [1, 2])
  },

  'does not chain detections whose tempo disagrees': () => {
    const windows = [0, 10].map((start, i) =>
      windowAt(start, [row({ previewId: 1, setSeconds: start + 15, previewSeconds: start + 15, tempo: i ? 1.06 : 1 })]),
    )
    // Same anchor at set 0 only for tempo 1; the 1.06 detection lands elsewhere.
    const plays = stitch(windows, { minWindows: 2, minSingleWindowScore: 100 })
    assert.strictEqual(plays.length, 0)
  },
})
