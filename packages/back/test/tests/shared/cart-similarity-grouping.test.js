const assert = require('assert')
const { test } = require('cascade-test')
const g = require('../../../routes/shared/cart-similarity/grouping.js')

// Deterministic pseudo-random numbers so the fixtures are stable.
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

// `count` unit vectors scattered tightly around `centre`.
const cluster = (centre, count, spread, random) =>
  Array.from({ length: count }, () => g.normalise(centre.map((x) => x + (random() - 0.5) * spread)))

const axis = (dim, i) => Array.from({ length: dim }, (_, j) => (j === i ? 1 : 0))

const sameGrouping = (labels, expected) => {
  const pairs = new Map()
  labels.forEach((l, i) => {
    if (!pairs.has(l)) pairs.set(l, expected[i])
    assert.strictEqual(pairs.get(l), expected[i], `point ${i} is grouped with the wrong points`)
  })
  assert.strictEqual(new Set(labels).size, new Set(expected).size)
}

test({
  'Ward separates two distant clusters': () => {
    const random = rng(1)
    const vectors = [...cluster(axis(8, 0), 4, 0.2, random), ...cluster(axis(8, 1), 5, 0.2, random)]
    const merges = g.wardLinkage(vectors)
    assert.strictEqual(merges.length, vectors.length - 1)
    sameGrouping(g.cutTree(merges, vectors.length, 2), [0, 0, 0, 0, 1, 1, 1, 1, 1])
  },

  'merges are ordered by height and cutting at n gives singletons': () => {
    const random = rng(2)
    const vectors = cluster(axis(6, 2), 7, 1.5, random)
    const merges = g.wardLinkage(vectors)
    for (let i = 1; i < merges.length; i++) assert.ok(merges[i].distance >= merges[i - 1].distance - 1e-12)
    assert.deepStrictEqual(g.cutTree(merges, 7, 7), [0, 1, 2, 3, 4, 5, 6])
    assert.deepStrictEqual(g.cutTree(merges, 7, 1), [0, 0, 0, 0, 0, 0, 0])
  },

  'automatic k picks the best-separated split with groups of at least three': () => {
    const random = rng(3)
    const vectors = [
      ...cluster(axis(10, 0), 4, 0.15, random),
      ...cluster(axis(10, 3), 4, 0.15, random),
      ...cluster(axis(10, 6), 4, 0.15, random),
    ]
    const merges = g.wardLinkage(vectors)
    assert.strictEqual(g.chooseAutoK(vectors, merges), 3)
  },

  'automatic k falls back to one group when nothing separates': () => {
    const vectors = cluster(axis(5, 0), 4, 0.01, rng(4))
    assert.strictEqual(g.chooseAutoK(vectors, g.wardLinkage(vectors)), 1)
  },

  'maxGroupCount is between 1 and 8': () => {
    assert.strictEqual(g.maxGroupCount(2), 1)
    assert.strictEqual(g.maxGroupCount(9), 3)
    assert.strictEqual(g.maxGroupCount(600), 8)
  },

  'Fit is 50 at the median, 100 at the centre and 0 at twice the median distance': () => {
    assert.strictEqual(g.fitScore(0.9, 0.9), 50)
    assert.strictEqual(g.fitScore(1, 0.9), 100)
    assert.strictEqual(g.fitScore(0.8, 0.9), 0)
    assert.strictEqual(g.fitScore(0.5, 0.9), 0)
  },

  'closerThan counts group tracks with a lower leave-one-out similarity': () => {
    assert.strictEqual(g.closerThan(0.85, [0.7, 0.8, 0.9, 0.95]), 50)
    assert.strictEqual(g.closerThan(0.99, [0.7, 0.8]), 100)
  },

  'push-away moves the centroid away from the misses': () => {
    const members = [g.normalise([1, 0.2, 0]), g.normalise([1, -0.2, 0])]
    const miss = g.normalise([0.6, 0.8, 0])
    const plain = g.pushedCentroid(members)
    const pushed = g.pushedCentroid(members, [miss])
    assert.ok(g.dot(pushed, miss) < g.dot(plain, miss))
  },

  'rankGroups orders groups by similarity': () => {
    const ranked = g.rankGroups(
      [1, 0],
      [
        [0, 1],
        [1, 0],
      ],
    )
    assert.deepStrictEqual(
      ranked.map((r) => r.group),
      [1, 0],
    )
  },

  'project2d keeps separated clusters apart and scales to 0…1': () => {
    const random = rng(5)
    const vectors = [...cluster(axis(6, 0), 3, 0.1, random), ...cluster(axis(6, 5), 3, 0.1, random)]
    const points = g.project2d(vectors)
    for (const p of points) {
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
    }
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
    assert.ok(dist(points[0], points[3]) > dist(points[0], points[1]))
  },

  'centre subtracts the mean and normalises': () => {
    const [v] = g.centre([[3, 4]], [0, 0])
    assert.ok(Math.abs(v[0] - 0.6) < 1e-12 && Math.abs(v[1] - 0.8) < 1e-12)
  },
})
