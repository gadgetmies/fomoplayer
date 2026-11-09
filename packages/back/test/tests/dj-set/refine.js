const assert = require('assert')
const { test } = require('cascade-test')
const { internals } = require('../../../scripts/dj-set/lib/refine.js')

const { bestTempo, log10PoissonTail } = internals

const PARAMS = { tempoSearch: 0.02, tempoStep: 0.001, bucketSeconds: 0.5, segmentMin: 4, maxTempoDeviation: 0.08 }

// One matched pair per set fingerprint i at set time s, preview time p.
const pairsAlong = ({ from, to, step = 0.25, tempo, offset, startIndex = 0 }) => {
  const pairs = []
  let i = startIndex
  for (let s = from; s < to; s += step) pairs.push({ i: i++, s, p: tempo * s + offset })
  return pairs
}

test({
  'finds the tempo of a stretched play': () => {
    const pairs = pairsAlong({ from: 600, to: 660, tempo: 1.047, offset: -600 })
    const best = bestTempo(pairs, 1.04, PARAMS)
    assert(Math.abs(best.tempoFactor - 1.047) <= 0.0015, `tempo ${best.tempoFactor}`)
    assert(best.score >= 0.9 * pairs.length, `score ${best.score} of ${pairs.length}`)
  },

  'sums the segments of a play split by a beat jump': () => {
    // Same tempo, the offset jumps by 8 s halfway through.
    const first = pairsAlong({ from: 100, to: 130, tempo: 1.02, offset: -60 })
    const second = pairsAlong({ from: 130, to: 160, tempo: 1.02, offset: -52, startIndex: first.length })
    const best = bestTempo([...first, ...second], 1.02, PARAMS)
    assert.strictEqual(best.segments.length, 2)
    assert(best.score >= 0.9 * (first.length + second.length))
  },

  'counts a loop repeating in the preview only once': () => {
    // Every set fingerprint matches the preview once per 2-second loop
    // repetition: many offsets, all covering the same set time.
    const pairs = []
    let i = 0
    for (let s = 200; s < 230; s += 0.25) {
      for (let rep = 0; rep < 10; rep++) pairs.push({ i, s, p: s - 180 + rep * 2 })
      i++
    }
    const best = bestTempo(pairs, 1, PARAMS)
    assert.strictEqual(best.segments.length, 1)
    assert(best.score <= i, `score ${best.score} counts more fingerprints than exist (${i})`)
  },

  'Poisson tail: rare peaks are significant, expected ones are not': () => {
    assert(log10PoissonTail(30, 0.5) < -30)
    assert(log10PoissonTail(1, 2) > -0.1)
    assert.strictEqual(log10PoissonTail(0, 1), 0)
    // No underflow to −Infinity for very strong peaks.
    assert(Number.isFinite(log10PoissonTail(500, 0.1)))
  },
})
