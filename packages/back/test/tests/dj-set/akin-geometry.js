const assert = require('assert')
const { test } = require('cascade-test')
const {
  positiveRuns,
  layerAudibleFractions,
  editedToOriginal,
  overlapMs,
} = require('../../../scripts/dj-set/lib/akin-geometry.js')

// 120 BPM: one bar is 2000 ms.
const BPM = 120

test({
  'a lane is audible between the zero points around its non-zero values': () => {
    // Pendulum – Tarantula's vocal lane in the S30 set: three phrases.
    const lane = [
      [0.08, 0],
      [0.09, 0.79],
      [0.2, 0.79],
      [0.21, 0],
      [0.24, 0],
      [0.25, 0.8],
      [0.37, 0.8],
      [0.38, 0],
      [0.99, 0],
    ]
    assert.deepStrictEqual(positiveRuns(lane), [
      [0.08, 0.21],
      [0.24, 0.38],
    ])
  },

  'a stem layer is audible where both the layer volume and the stem volume are': () => {
    const lanes = {
      volA: [
        [0, 0],
        [0.5, 1],
        [0.9, 0],
      ],
      stemVoxA: [
        [0.2, 0],
        [0.3, 1],
        [1, 1],
      ],
    }
    assert.deepStrictEqual(layerAudibleFractions(lanes, ['vocals']), [[0.2, 0.9]])
    assert.deepStrictEqual(layerAudibleFractions(lanes, []), [[0, 0.9]])
    assert.deepStrictEqual(layerAudibleFractions({}, ['vocals']), [[0, 1]])
  },

  'a forward beat jump skips the cut bars of the original track': () => {
    // +8 bars at 10 s: the edited track plays 0–10 s, then 26 s onwards.
    assert.deepStrictEqual(editedToOriginal([5000, 20000], [{ positionMs: 10000, sizeBars: 8 }], BPM), [
      [5000, 10000],
      [26000, 36000],
    ])
  },

  'a backward beat jump replays the bars before it once': () => {
    // -4 bars at 20 s: 0–20 s, 12–20 s again, then 20 s onwards.
    assert.deepStrictEqual(editedToOriginal([15000, 32000], [{ positionMs: 20000, sizeBars: -4 }], BPM), [
      [15000, 20000],
      [12000, 20000],
      [20000, 24000],
    ])
  },

  'without beat jumps the edited time is the original time': () => {
    assert.deepStrictEqual(editedToOriginal([1000, 2000], [], BPM), [[1000, 2000]])
  },

  'preview overlap counts replayed audio once': () => {
    assert.strictEqual(
      overlapMs(
        [
          [15000, 20000],
          [12000, 20000],
        ],
        [10000, 18000],
      ),
      6000,
    )
  },
})
