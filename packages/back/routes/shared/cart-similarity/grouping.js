// Pure maths for the cart similarity search: no I/O, so every step is unit-testable.
//
// Vectors are plain arrays of numbers. The search works in a "centred" space: every embedding has the user's
// collection mean subtracted and is scaled to unit length, which separates styles better than raw cosine.

const PUSH_STRENGTH = 0.5
const MIN_AUTO_GROUP_SIZE = 3
const MAX_K = 8

const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

const norm = (a) => Math.sqrt(dot(a, a))

const normalise = (a) => {
  const n = norm(a) || 1
  return a.map((x) => x / n)
}

const meanVector = (vectors) => {
  const m = new Array(vectors[0].length).fill(0)
  for (const v of vectors) for (let i = 0; i < v.length; i++) m[i] += v[i]
  return m.map((x) => x / vectors.length)
}

const subtract = (a, b) => a.map((x, i) => x - b[i])

const centre = (vectors, mean) => vectors.map((v) => normalise(subtract(v, mean)))

// Ward linkage with the nearest-neighbour-chain algorithm, O(n²) time and memory.
// Returns merges as [{ a, b, distance, size }] in merge order, where a and b are cluster ids:
// 0…n-1 are the input points, n+i is the cluster created by merge i (scipy convention).
const wardLinkage = (vectors) => {
  const n = vectors.length
  if (n < 2) return []
  // Squared euclidean distances, stored in a flat array; for Ward the Lance–Williams update works on these.
  const d = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0
      const vi = vectors[i]
      const vj = vectors[j]
      for (let k = 0; k < vi.length; k++) {
        const diff = vi[k] - vj[k]
        s += diff * diff
      }
      d[i * n + j] = s
      d[j * n + i] = s
    }
  }
  const size = new Array(n).fill(1)
  const active = new Array(n).fill(true)
  const clusterId = Array.from({ length: n }, (_, i) => i)
  const merges = []
  const chain = []
  let remaining = n

  while (remaining > 1) {
    if (chain.length === 0) chain.push(active.indexOf(true))
    for (;;) {
      const a = chain[chain.length - 1]
      const prev = chain.length > 1 ? chain[chain.length - 2] : -1
      let best = prev
      let bestD = prev >= 0 ? d[a * n + prev] : Infinity
      for (let j = 0; j < n; j++) {
        if (!active[j] || j === a) continue
        const dj = d[a * n + j]
        if (dj < bestD) {
          bestD = dj
          best = j
        }
      }
      if (best === prev) break
      chain.push(best)
    }
    const b = chain.pop()
    const a = chain.pop()
    const sa = size[a]
    const sb = size[b]
    const dab = d[a * n + b]
    merges.push({ a: clusterId[a], b: clusterId[b], distance: Math.sqrt(Math.max(0, dab)), size: sa + sb })
    // Merge b into a (Lance–Williams update for Ward on squared distances).
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a || k === b) continue
      const sk = size[k]
      const v = ((sa + sk) * d[a * n + k] + (sb + sk) * d[b * n + k] - sk * dab) / (sa + sb + sk)
      d[a * n + k] = v
      d[k * n + a] = v
    }
    active[b] = false
    size[a] = sa + sb
    clusterId[a] = n + merges.length - 1
    remaining--
  }
  // The chain algorithm finds merges out of height order; sort them and renumber cluster ids so that cutting the
  // tree by undoing the last merges is valid.
  return renumberByHeight(merges, n)
}

const renumberByHeight = (merges, n) => {
  const order = merges.map((m, i) => ({ ...m, i })).sort((x, y) => x.distance - y.distance || x.i - y.i)
  const newId = new Map()
  order.forEach((m, rank) => newId.set(n + m.i, n + rank))
  const mapId = (id) => (id < n ? id : newId.get(id))
  return order.map(({ a, b, distance, size }) => ({ a: mapId(a), b: mapId(b), distance, size }))
}

// Labels 0…k-1 for each point when the tree is cut into k clusters. Labels are numbered by first appearance.
const cutTree = (merges, n, k) => {
  const parent = Array.from({ length: n + merges.length }, (_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const applied = Math.max(0, Math.min(merges.length, n - k))
  for (let i = 0; i < applied; i++) {
    const { a, b } = merges[i]
    const id = n + i
    parent[find(a)] = id
    parent[find(b)] = id
  }
  const labelOf = new Map()
  return Array.from({ length: n }, (_, i) => {
    const root = find(i)
    if (!labelOf.has(root)) labelOf.set(root, labelOf.size)
    return labelOf.get(root)
  })
}

const groupSizes = (labels) => {
  const sizes = []
  for (const l of labels) sizes[l] = (sizes[l] || 0) + 1
  return sizes
}

// Mean silhouette with cosine distance (1 − dot) on unit vectors.
const silhouette = (vectors, labels) => {
  const n = vectors.length
  const k = Math.max(...labels) + 1
  if (k < 2 || k >= n) return 0
  const sizes = groupSizes(labels)
  let total = 0
  for (let i = 0; i < n; i++) {
    const sums = new Array(k).fill(0)
    for (let j = 0; j < n; j++) if (j !== i) sums[labels[j]] += 1 - dot(vectors[i], vectors[j])
    const own = labels[i]
    if (sizes[own] <= 1) continue
    const a = sums[own] / (sizes[own] - 1)
    let b = Infinity
    for (let c = 0; c < k; c++) if (c !== own && sizes[c] > 0) b = Math.min(b, sums[c] / sizes[c])
    total += (b - a) / Math.max(a, b, 1e-12)
  }
  return total / n
}

const maxGroupCount = (n) => Math.max(1, Math.min(MAX_K, Math.floor(n / 3)))

// The best-separated split: highest mean silhouette among k = 2…maxK where every group has at least three tracks.
const chooseAutoK = (vectors, merges) => {
  const n = vectors.length
  const maxK = maxGroupCount(n)
  let best = { k: 1, score: -Infinity }
  for (let k = 2; k <= maxK; k++) {
    const labels = cutTree(merges, n, k)
    if (groupSizes(labels).some((s) => s < MIN_AUTO_GROUP_SIZE)) continue
    const score = silhouette(vectors, labels)
    if (score > best.score) best = { k, score }
  }
  return best.k
}

const median = (sorted) => {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Similarity of each group member to the centroid of the other members (leave-one-out), sorted ascending.
const leaveOneOutSimilarities = (members) => {
  if (members.length < 2) return [1]
  const sum = new Array(members[0].length).fill(0)
  for (const v of members) for (let i = 0; i < v.length; i++) sum[i] += v[i]
  return members.map((v) => dot(v, normalise(sum.map((s, i) => s - v[i])))).sort((a, b) => a - b)
}

// 100 = at the group's centre, 50 = as close as the group's median track, 0 = twice that distance.
const fitScore = (similarity, groupMedian) =>
  Math.max(0, Math.min(100, Math.round(100 - (50 * (1 - similarity)) / Math.max(1e-6, 1 - groupMedian))))

const closerThan = (similarity, sortedLoo) =>
  Math.round((100 * sortedLoo.filter((v) => v < similarity).length) / sortedLoo.length)

// Group centroid, pushed away from the misses assigned to the group: c − PUSH_STRENGTH · mean(misses).
const pushedCentroid = (members, misses = []) => {
  const c = meanVector(members)
  if (misses.length === 0) return normalise(c)
  const m = meanVector(misses)
  return normalise(c.map((x, i) => x - PUSH_STRENGTH * m[i]))
}

// Best and second-best group for a vector, by similarity to each group centroid.
const rankGroups = (vector, centroids) =>
  centroids.map((c, group) => ({ group, similarity: dot(vector, c) })).sort((a, b) => b.similarity - a.similarity)

// Two principal axes (power iteration with deflation) of the vectors, plus their mean. Deterministic.
const pcaAxes = (vectors) => {
  const dim = vectors[0].length
  const mean = meanVector(vectors)
  const X = vectors.map((v) => subtract(v, mean))
  const axes = []
  for (let c = 0; c < 2; c++) {
    let w = normalise(Array.from({ length: dim }, (_, i) => Math.sin(i * 12.9898 + c * 78.233) + 0.01))
    for (let iter = 0; iter < 60; iter++) {
      const next = new Array(dim).fill(0)
      for (const x of X) {
        const p = dot(x, w)
        for (let i = 0; i < dim; i++) next[i] += p * x[i]
      }
      for (const prev of axes) {
        const p = dot(next, prev)
        for (let i = 0; i < dim; i++) next[i] -= p * prev[i]
      }
      const nn = norm(next)
      if (nn < 1e-12) break
      w = next.map((x) => x / nn)
    }
    axes.push(w)
  }
  return { mean, axes }
}

// Raw projections → coordinates scaled to 0…1 per axis.
const scaleToUnit = (points) => {
  if (points.length === 0) return []
  const scaled = [0, 1].map((axis) => {
    const values = points.map((p) => p[axis])
    const min = Math.min(...values)
    const range = Math.max(...values) - min || 1
    return values.map((v) => (v - min) / range)
  })
  return points.map((_, i) => ({ x: scaled[0][i], y: scaled[1][i] }))
}

// PCA to two dimensions, coordinates scaled to 0…1.
const project2d = (vectors) => {
  if (vectors.length === 0) return []
  const { mean, axes } = pcaAxes(vectors)
  return scaleToUnit(vectors.map((v) => axes.map((w) => dot(v, w) - dot(mean, w))))
}

module.exports = {
  PUSH_STRENGTH,
  dot,
  normalise,
  meanVector,
  subtract,
  centre,
  wardLinkage,
  cutTree,
  groupSizes,
  silhouette,
  maxGroupCount,
  chooseAutoK,
  median,
  leaveOneOutSimilarities,
  fitScore,
  closerThan,
  pushedCentroid,
  rankGroups,
  pcaAxes,
  scaleToUnit,
  project2d,
}
