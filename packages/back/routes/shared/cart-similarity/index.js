const R = require('ramda')
const { NotFound } = require('../httpErrors')
const g = require('./grouping')
const db = require('../db/cart-similarity')

// Nearest previews fetched per group. pgvector caps hnsw.ef_search at 1000, which bounds one HNSW scan. Each scan
// costs roughly the same, so a fixed budget is split across the groups: more groups → a smaller pool per group.
const CANDIDATE_POOL_BUDGET = 1600
const MIN_POOL_PER_GROUP = 300
const MAX_POOL_PER_GROUP = 1000
const poolSizeFor = (groupCount) =>
  Math.max(MIN_POOL_PER_GROUP, Math.min(MAX_POOL_PER_GROUP, Math.round(CANDIDATE_POOL_BUDGET / groupCount)))
const DEFAULT_RESULTS_PER_GROUP = 50
const MAX_RESULTS_PER_GROUP = 100

const parseIdList = (value) =>
  R.uniq(
    String(value || '')
      .split(',')
      .map((v) => parseInt(v, 10))
      .filter((v) => Number.isInteger(v) && v > 0),
  )

const parseBoolean = (value) => value === true || value === 'true' || value === '1'

// Group label: the two artists that appear most often among the group's tracks.
const groupName = (trackIds, detailsById) => {
  const counts = new Map()
  for (const id of trackIds) {
    for (const artist of detailsById.get(id)?.artists || []) {
      if (artist?.name) counts.set(artist.name, (counts.get(artist.name) || 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2)
  return top.map(([name]) => name).join(', ') || `Group`
}

const emptyResult = (cart, reason) => ({
  cart,
  k: 0,
  autoK: 0,
  maxK: 0,
  groups: [],
  tracks: [],
  map: { members: [] },
  excluded: { heard: 0, ignored: 0, purchased: 0, newOnly: 0 },
  reason,
})

/**
 * Tracks similar to a cart, searched per group of similar cart tracks.
 *
 * @param {object} options
 * @param {number} options.userId
 * @param {string} options.cartUuid
 * @param {number} [options.k] number of groups; defaults to the best-separated split
 * @param {boolean} [options.newOnly] hide tracks by followed or purchased artists
 * @param {number[]|string} [options.misses] session "Not this" track ids; the search is pushed away from them
 * @param {number} [options.limit] results per group
 */
module.exports.searchSimilarToCart = async ({ userId, cartUuid, k, newOnly, misses, limit }) => {
  const cart = await db.queryUserCartByUuid(userId, cartUuid)
  if (!cart) throw new NotFound(`Cart not found: ${cartUuid}`)

  const members = await db.queryCartTrackEmbeddings(cart.id)
  if (members.length < 2) {
    return emptyResult(cart, 'The cart needs at least two analysed tracks to find similar tracks.')
  }

  const collectionMean = (await db.queryCollectionMean(userId)) || g.meanVector(members.map((m) => m.embedding))
  const vectors = g.centre(
    members.map((m) => m.embedding),
    collectionMean,
  )
  const merges = g.wardLinkage(vectors)
  const maxK = g.maxGroupCount(members.length)
  const autoK = g.chooseAutoK(vectors, merges)
  const requestedK = parseInt(k, 10)
  const groupCount = Number.isInteger(requestedK) ? Math.max(1, Math.min(maxK, requestedK)) : autoK
  const labels = g.cutTree(merges, members.length, groupCount)

  const groupMembers = Array.from({ length: groupCount }, () => [])
  labels.forEach((label, i) => groupMembers[label].push(i))

  // Session misses: assign each to its nearest group and push that group's centroid away from it.
  const missIds = parseIdList(Array.isArray(misses) ? misses.join(',') : misses)
  const missVectors = g.centre(
    (await db.queryTrackEmbeddings(missIds)).map((m) => m.embedding),
    collectionMean,
  )
  const plainCentroids = groupMembers.map((idx) => g.pushedCentroid(idx.map((i) => vectors[i])))
  const missesByGroup = groupMembers.map(() => [])
  for (const v of missVectors) missesByGroup[g.rankGroups(v, plainCentroids)[0].group].push(v)
  const centroids = groupMembers.map((idx, gi) =>
    g.pushedCentroid(
      idx.map((i) => vectors[i]),
      missesByGroup[gi],
    ),
  )

  // Leave-one-out similarities of each group's own tracks: the scale for Fit and "closer than".
  const loo = groupMembers.map((idx) => g.leaveOneOutSimilarities(idx.map((i) => vectors[i])))
  const looMedian = loo.map(g.median)

  // The HNSW index is on raw vectors: query it with the point a typical group track would have in raw space.
  const rawRadius = R.mean(
    members.map((m) =>
      Math.sqrt(g.dot(g.subtract(m.embedding, collectionMean), g.subtract(m.embedding, collectionMean))),
    ),
  )
  const queries = centroids.map((c) => collectionMean.map((x, i) => x + c[i] * rawRadius))

  const { mean: pcaMean, axes } = g.pcaAxes(vectors)
  const candidates = await db.queryCandidates({
    userId,
    cartId: cart.id,
    queries,
    centroids,
    mean: collectionMean,
    axes,
    poolSize: poolSizeFor(groupCount),
    excludeTrackIds: missIds,
  })

  const showNewOnly = parseBoolean(newOnly)
  const excluded = { heard: 0, ignored: 0, purchased: 0, newOnly: 0 }
  const visible = []
  for (const c of candidates) {
    if (c.heard) excluded.heard++
    if (c.ignored) excluded.ignored++
    if (c.purchased) excluded.purchased++
    if (c.heard || c.ignored || c.purchased) continue
    if (showNewOnly && (c.artist_followed || c.artist_purchased)) {
      excluded.newOnly++
      continue
    }
    visible.push(c)
  }

  const scored = visible.map((c) => {
    const sims = c.similarities.map(Number)
    const ranked = sims.map((similarity, group) => ({ group, similarity })).sort((a, b) => b.similarity - a.similarity)
    const [best, next] = ranked
    return {
      trackId: c.track_id,
      group: best.group,
      similarity: best.similarity,
      fit: g.fitScore(best.similarity, looMedian[best.group]),
      closerThan: g.closerThan(best.similarity, loo[best.group]),
      nextGroup: next ? next.group : null,
      nextFit: next ? g.fitScore(next.similarity, looMedian[next.group]) : null,
      projection: c.projection.map((v, a) => Number(v) - g.dot(pcaMean, axes[a])),
    }
  })

  const perGroupLimit = Math.max(1, Math.min(MAX_RESULTS_PER_GROUP, parseInt(limit, 10) || DEFAULT_RESULTS_PER_GROUP))
  const perGroup = groupMembers.map((_, gi) =>
    scored
      .filter((s) => s.group === gi)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, perGroupLimit),
  )
  const results = perGroup.flat().sort((a, b) => b.fit - a.fit || b.similarity - a.similarity)

  // Map coordinates: cart tracks and results projected on the same axes, scaled together.
  const memberPoints = vectors.map((v) => axes.map((w) => g.dot(v, w) - g.dot(pcaMean, w)))
  const coords = g.scaleToUnit([...memberPoints, ...results.map((r) => r.projection)])

  const memberIds = members.map((m) => m.trackId)
  const details = await db.queryTrackDetails(userId, [...results.map((r) => r.trackId), ...memberIds])
  const detailsById = new Map(details.map((d) => [d.id, d]))

  const groups = groupMembers.map((idx, gi) => {
    const trackIds = idx.map((i) => memberIds[i])
    return {
      index: gi,
      name: groupName(trackIds, detailsById),
      size: idx.length,
      trackIds,
      resultCount: perGroup[gi].length,
      pushedAwayFrom: missesByGroup[gi].length,
    }
  })

  const tracks = results
    .map((r, i) => {
      const track = detailsById.get(r.trackId)
      if (!track) return null
      const { x, y } = coords[memberPoints.length + i]
      return {
        ...track,
        cartSearch: {
          group: r.group,
          fit: r.fit,
          closerThan: r.closerThan,
          similarity: Math.round(r.similarity * 1000) / 1000,
          nextGroup: r.nextGroup,
          nextFit: r.nextFit,
          x,
          y,
        },
      }
    })
    .filter(Boolean)

  return {
    cart,
    k: groupCount,
    autoK,
    maxK,
    groups,
    tracks,
    map: {
      members: memberIds.map((trackId, i) => ({ trackId, group: labels[i], x: coords[i].x, y: coords[i].y })),
    },
    excluded,
  }
}
