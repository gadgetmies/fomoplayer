const R = require('ramda')
const { NotFound } = require('../httpErrors')
const g = require('./grouping')
const db = require('../db/cart-similarity')
const { hasSearchFilters, hasSelectiveSearchFilters, queryFilteredTrackIds } = require('../db/search')

// Nearest previews fetched per group. pgvector caps hnsw.ef_search at 1000, which bounds one HNSW scan. Each scan
// costs roughly the same and reads its index pages from disk when they are not cached, so a fixed budget is split
// across the groups: more groups → a smaller pool per group.
const CANDIDATE_POOL_BUDGET = 1000
const MIN_POOL_PER_GROUP = 200
const MAX_POOL_PER_GROUP = 500
const poolSizeFor = (groupCount) =>
  Math.max(MIN_POOL_PER_GROUP, Math.min(MAX_POOL_PER_GROUP, Math.round(CANDIDATE_POOL_BUDGET / groupCount)))
const DEFAULT_RESULTS_PER_GROUP = 50
const MAX_RESULTS_PER_GROUP = 100
// With an artist, label, release, genre, key or bpm term the matching tracks are scored directly when there are at
// most this many of them. With more, or with only free text or stores, the nearest tracks are fetched as usual and the
// terms filter them.
const MAX_DIRECTLY_SCORED_TRACKS = 2000

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

const emptyResult = (cart, cartTracks, reason) => ({
  cart,
  cartTracks,
  limitPerGroup: 0,
  k: 0,
  autoK: 0,
  maxK: 0,
  groups: [],
  tracks: [],
  map: { members: [] },
  excluded: { heard: 0, ignored: 0, purchased: 0, knownArtists: 0 },
  reason,
})

// The tracks to score: the nearest tracks to each group, filtered by the other search terms. With a selective term
// (artist, label, genre, …) every matching track is scored instead when there are few enough of them, so that e.g. a
// label's tracks are found even when none of them is among the nearest.
const findCandidateTrackIds = async ({ cartId, queries, poolSize, query, stores, addedSince }) => {
  if (!hasSearchFilters(query, { stores, addedSince })) return db.queryNearestTrackIds({ cartId, queries, poolSize })
  if (hasSelectiveSearchFilters(query)) {
    const matching = await queryFilteredTrackIds(query, { stores, addedSince, limit: MAX_DIRECTLY_SCORED_TRACKS + 1 })
    if (matching.length <= MAX_DIRECTLY_SCORED_TRACKS) return matching
  }
  const nearest = await db.queryNearestTrackIds({ cartId, queries, poolSize })
  return queryFilteredTrackIds(query, { stores, addedSince, trackIds: nearest })
}

/**
 * Tracks similar to a cart, searched per group of similar cart tracks.
 *
 * @param {object} options
 * @param {number} options.userId
 * @param {string} options.cartUuid
 * @param {number} [options.k] number of groups; defaults to the best-separated split
 * @param {boolean} [options.newArtistsOnly] hide tracks by followed or purchased artists
 * @param {number[]|string} [options.misses] session "Not this" track ids; the search is pushed away from them
 * @param {number} [options.limit] results per group
 * @param {string} [options.query] the whole search query: its other terms (text, artist, label, …) filter the results
 * @param {string[]} [options.stores] only tracks from these stores
 * @param {string} [options.addedSince] only tracks added after this time
 */
module.exports.searchSimilarToCart = async ({
  userId,
  cartUuid,
  k,
  newArtistsOnly,
  misses,
  limit,
  query = '',
  stores,
  addedSince,
}) => {
  const cart = await db.queryUserCartByUuid(userId, cartUuid)
  if (!cart) throw new NotFound(`Cart not found: ${cartUuid}`)

  // Independent queries run in parallel: each one mostly waits for disk reads.
  const [members, counts, cachedCollectionMean] = await Promise.all([
    db.queryCartTrackEmbeddings(cart.id),
    db.queryCartTrackCounts(cart.id),
    db.queryCollectionMean(userId),
  ])
  // The groups are formed from the most recently added analysed tracks only.
  const cartTracks = { ...counts, used: members.length, limit: db.MAX_GROUPED_TRACKS }
  if (members.length < 2) {
    return emptyResult(cart, cartTracks, 'The cart needs at least two analysed tracks to find similar tracks.')
  }

  const collectionMean = cachedCollectionMean || g.meanVector(members.map((m) => m.embedding))
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
  const candidateTrackIds = await findCandidateTrackIds({
    cartId: cart.id,
    queries,
    poolSize: poolSizeFor(groupCount),
    query,
    stores,
    addedSince,
  })
  const candidates = await db.scoreCandidates({
    userId,
    cartId: cart.id,
    trackIds: candidateTrackIds,
    centroids,
    mean: collectionMean,
    axes,
    excludeTrackIds: missIds,
  })

  const showNewOnly = parseBoolean(newArtistsOnly)
  const excluded = { heard: 0, ignored: 0, purchased: 0, knownArtists: 0 }
  const visible = []
  for (const c of candidates) {
    if (c.heard) excluded.heard++
    if (c.ignored) excluded.ignored++
    if (c.purchased) excluded.purchased++
    if (c.heard || c.ignored || c.purchased) continue
    if (showNewOnly && (c.artist_followed || c.artist_purchased)) {
      excluded.knownArtists++
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
    cartTracks,
    limitPerGroup: perGroupLimit,
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
