'use strict'
// Vector search for clients that hold their own track embeddings (Harmonia): they send vectors of a shared
// track-embedding specification version, never audio, and get the previews' tracks ranked by cosine distance.
// Nothing from a request is stored or logged.
//
//   GET  /api/embeddings/versions       -> { versions: [{ version, coverage, count }] }
//   POST /api/embeddings/similar-tracks -> { version, tracks: [...] }
//
// API-key clients only (Authorization: Bearer fp_…), counted by the API-key rate limiter like every API-key request.
const router = require('express').Router()
const { frontendURL } = require('../../config')
const { EMBEDDING_VERSIONS, TYPE_BY_VERSION, EMBEDDING_DIMENSIONS } = require('../shared/embedding-versions')
const { queryTrackDetails } = require('../shared/db/cart-similarity')
const { queryPreviewEmbeddingCounts, queryHasPreviewEmbeddings, queryNearestTracks } = require('./db')

const MAX_VECTORS = 50
const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
// What the client's vectors were computed from (the specification's `coverage`): a whole file or a store preview.
const QUERY_COVERAGES = ['full', 'preview']
// What this instance indexes: store previews.
const INDEX_COVERAGE = 'preview'

// The session cookie also authenticates /api; these routes are for API-key clients only.
const requireApiKey = (req, res, next) => {
  if (!(req.headers.authorization ?? '').startsWith('Bearer fp_')) {
    return res.status(401).json({ error: 'api_key_required', message: 'Send a Fomo Player API key as a Bearer token' })
  }
  next()
}

const indexedVersions = async () =>
  (await queryPreviewEmbeddingCounts())
    .filter(({ type, count }) => EMBEDDING_VERSIONS[type] && count > 0)
    .map(({ type, count }) => ({ version: EMBEDDING_VERSIONS[type], coverage: INDEX_COVERAGE, count }))
    .sort((a, b) => a.version.localeCompare(b.version))

const isVector = (v) =>
  Array.isArray(v) &&
  v.length === EMBEDDING_DIMENSIONS &&
  v.every((x) => typeof x === 'number' && Number.isFinite(x)) &&
  v.some((x) => x !== 0)

// The request body's problem, or undefined when it is valid.
const validationError = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'The body must be a JSON object'
  const { version, coverage, vectors, limit } = body
  if (typeof version !== 'string' || version === '') return '`version` must be a specification version string'
  if (!QUERY_COVERAGES.includes(coverage)) return `\`coverage\` must be one of ${QUERY_COVERAGES.join(', ')}`
  if (!Array.isArray(vectors) || vectors.length < 1 || vectors.length > MAX_VECTORS) {
    return `\`vectors\` must be an array of 1 to ${MAX_VECTORS} vectors`
  }
  const bad = vectors.findIndex((v) => !isVector(v))
  if (bad !== -1) {
    return `\`vectors[${bad}]\` must have ${EMBEDDING_DIMENSIONS} finite numbers, not all zero`
  }
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT)) {
    return `\`limit\` must be an integer from 1 to ${MAX_LIMIT}`
  }
  return undefined
}

const trackUrl = (trackId) => `${frontendURL}/search?q=${encodeURIComponent(`track:${trackId}`)}`
const entities = (list) => (list ?? []).map(({ id, name }) => ({ id, name }))
// node-postgres reads a DATE as local midnight; the calendar date is what was stored.
const isoDate = (date) => {
  if (!date) return null
  if (!(date instanceof Date)) return String(date).slice(0, 10)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const resultTrack = ({ trackId, distance, queryIndex }, details) => ({
  id: trackId,
  url: trackUrl(trackId),
  distance,
  similarity: Math.max(0, 1 - distance),
  queryIndex,
  title: details.title,
  version: details.version ?? null,
  artists: entities(details.artists),
  remixers: entities(details.remixers),
  labels: entities(details.labels),
  releaseDate: isoDate(details.released),
  durationMs: details.duration ?? null,
  stores: (details.stores ?? []).map(({ name, code, url, release }) => ({
    name,
    code,
    url: url ?? null,
    releaseUrl: release?.url ?? null,
  })),
})

router.use(requireApiKey)

router.get('/versions', async (req, res) => {
  res.json({ versions: await indexedVersions() })
})

router.post('/similar-tracks', async ({ body, user: { id: userId } }, res) => {
  const problem = validationError(body)
  if (problem) return res.status(400).json({ error: 'invalid_request', message: problem })

  const { version, vectors, limit = DEFAULT_LIMIT } = body
  const type = TYPE_BY_VERSION[version]
  if (!type || !(await queryHasPreviewEmbeddings(type))) {
    return res.status(409).json({
      error: 'embedding_version_unsupported',
      message: `This instance does not index ${version}`,
      versions: await indexedVersions(),
    })
  }

  const nearest = await queryNearestTracks({ userId, type, vectors, limit })
  const details = new Map(
    (
      await queryTrackDetails(
        userId,
        nearest.map(({ trackId }) => trackId),
      )
    ).map((t) => [t.id, t]),
  )
  res.json({
    version,
    tracks: nearest.filter(({ trackId }) => details.has(trackId)).map((n) => resultTrack(n, details.get(n.trackId))),
  })
})

module.exports = router
