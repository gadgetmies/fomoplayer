const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)
const { NotFound } = require('../httpErrors')

// TODO: would it be possible to somehow derive these from the track_details function?
const aliasToColumn = {
  published: 'store__track_published',
  released: 'store__track_released',
  added: 'track_added',
  title: 'track_title',
  heard: 'user__track_heard',
}

// Field filters, fuzzy filters and free text of a search query, shared by the track search and the cart search.
const parseSearchFilters = (originalQueryString) => {
  const fieldFilters = originalQueryString.match(/(\S+:\S+)+?/g)?.map((s) => s.split(':')) || []
  const queryString = originalQueryString.replace(/(\S+:\S+)\s*/g, '').trim()

  const hasUnresolvedEntityFilter = fieldFilters.some(([key, value]) => {
    if (!['artist', 'label', 'release', 'track', 'genre'].includes(key)) return false
    const numericPart = value.startsWith('~') ? value.slice(1) : value
    return !/^\d+$/.test(numericPart)
  })

  const idFilters = fieldFilters.filter(
    ([key, value]) => ['artist', 'label', 'release', 'track'].includes(key) && /^\d+$/.test(value),
  )

  const genreFilters = fieldFilters
    .filter(([key, value]) => key === 'genre' && /^\d+$/.test(value))
    .map(([, value]) =>
      sql`EXISTS (SELECT 1 FROM track__genre t2 WHERE t2.track_id = track.track_id AND t2.genre_id = ${parseInt(value, 10)})`,
    )

  const keyToJoinsLookup = {
    bpm: sql``,
    key: sql`NATURAL JOIN track__key NATURAL JOIN key NATURAL JOIN key_name`,
  }

  const keyToQueryFnLookup = {
    bpm: (value) =>
      sql`LEAST(ABS(store__track_bpm - ${value}), ABS(store__track_bpm * 2 - ${value}), ABS(store__track_bpm - ${value} * 2)) < 5`,
    key: (value) =>
      sql`key_id IN (
        SELECT k.key_id FROM KEY k, (
          SELECT key.key_id, key_key FROM key NATURAL JOIN key_name WHERE LOWER(key_name) = LOWER(${value})
        ) sk WHERE ABS((k.key_key).chord_number - (sk.key_key).chord_number) <= 1
      )`,
  }

  const fuzzyFilters = fieldFilters
    .filter(([key, value]) => ['bpm', 'key'].includes(key) && value.startsWith('~'))
    .map(([key, value]) => [key, value.substring(1)])
  const fuzzyFilterQueries = fuzzyFilters.map(([key, value]) => keyToQueryFnLookup[key](value))
  const fuzzyFilterJoins = fuzzyFilters.map(([key]) => keyToJoinsLookup[key])

  const exactKeyFilters = fieldFilters
    .filter(([key, value]) => key === 'key' && !value.startsWith('~'))
    .map(([, value]) =>
      sql`EXISTS (SELECT 1 FROM track__key JOIN key ON track__key.key_id = key.key_id JOIN key_name kn ON key.key_id = kn.key_id WHERE track__key.track_id = track.track_id AND LOWER(kn.key_name) = LOWER(${value}))`,
    )

  const bpmRangeFilters = fieldFilters
    .filter(([key, value]) => key === 'bpm' && /^\d+-\d+$/.test(value))
    .map(([, value]) => {
      const [min, max] = value.split('-').map(Number)
      return sql`store__track_bpm BETWEEN ${min} AND ${max}`
    })

  const bpmExactFilters = fieldFilters
    .filter(([key, value]) => key === 'bpm' && /^\d+(?:\.\d+)?$/.test(value))
    .map(([, value]) => sql`store__track_bpm = ${Number(value)}`)
  const exactFilterGroups = [exactKeyFilters, bpmRangeFilters, bpmExactFilters, genreFilters]

  return {
    fieldFilters,
    queryString,
    hasUnresolvedEntityFilter,
    idFilters,
    fuzzyFilters,
    fuzzyFilterQueries,
    fuzzyFilterJoins,
    exactFilterGroups,
  }
}

const idFilterToTable = {
  artist: 'track__artist',
  label: 'track__label',
  release: 'release__track',
}

// Appends the artist / label / release / track id filters and the fuzzy and exact (key, bpm, genre) filters as
// AND conditions.
const appendFieldFilters = (query, tx, { idFilters, fuzzyFilterQueries, exactFilterGroups }) => {
  for (const idFilter of idFilters) {
    if (idFilter[0] === 'track') {
      query.append(sql` AND track.track_id = ${idFilter[1]}`)
    } else {
      const junctionTable = idFilterToTable[idFilter[0]]
      query.append(
        ` AND EXISTS (SELECT 1 FROM ${tx.escapeIdentifier(junctionTable)} t2 WHERE t2.track_id = track.track_id AND t2.${tx.escapeIdentifier(
          `${idFilter[0]}_id`,
        )} = `,
      )
      query.append(sql`${idFilter[1]}`)
      query.append(`)`)
    }
  }
  if (fuzzyFilterQueries.length > 0) {
    query.append(' AND ')
    R.intersperse(' AND ', fuzzyFilterQueries).forEach((q) => query.append(q))
    query.append(' ')
  }
  exactFilterGroups.forEach((filters) => {
    if (filters.length > 0) {
      query.append(' AND ')
      R.intersperse(' AND ', filters).forEach((q) => query.append(q))
    }
  })
}

// Appends the free-text match as a HAVING clause. Name fields of entity types that are already filtered by id are
// left out: otherwise e.g. artist:1 techno would match ALL tracks by "Techno Artist" because the artist name itself
// contains "techno", making the text filter a no-op.
const appendTextFilter = (query, { idFilters, queryString }) => {
  if (queryString === '') return
  const filteredEntityTypes = new Set(idFilters.map(([type]) => type))
  const textParts = [`track_title || ' ' || COALESCE(track_version, '')`]
  if (!filteredEntityTypes.has('artist')) textParts.push(`STRING_AGG(artist_name, ' ')`)
  if (!filteredEntityTypes.has('release')) textParts.push(`STRING_AGG(release_name, ' ')`)
  if (!filteredEntityTypes.has('label')) textParts.push(`STRING_AGG(COALESCE(label_name, ''), ' ')`)
  query.append(
    ` HAVING TO_TSVECTOR('simple', unaccent(${textParts.join(` || ' ' || `)})) @@ websearch_to_tsquery('simple', unaccent(`,
  )
  query.append(sql`${queryString}`)
  query.append(`))`)
}

// Search terms that narrow the catalogue (free text, field filters, stores, added since). The similarity terms
// (cart:~, track:~, sample:~) are not filters.
const SIMILARITY_TERM = /(?:cart|track|sample):~\S+\s*/gi
const stripSimilarityTerms = (originalQueryString) => originalQueryString.replace(SIMILARITY_TERM, '').trim()

module.exports.hasSearchFilters = (originalQueryString, { stores, addedSince } = {}) =>
  stripSimilarityTerms(originalQueryString) !== '' || Boolean(addedSince) || (stores !== undefined && stores !== null)

// Field filters that pick tracks through an index (artist, label, release, track, genre, key, bpm). Free text and
// stores are not selective: matching them scans most of the catalogue.
const SELECTIVE_FIELDS = ['artist', 'label', 'release', 'track', 'genre', 'key', 'bpm']
module.exports.hasSelectiveSearchFilters = (originalQueryString) =>
  parseSearchFilters(stripSimilarityTerms(originalQueryString)).fieldFilters.some(([key]) =>
    SELECTIVE_FIELDS.includes(key),
  )

/**
 * Ids of the tracks that match the filters of a search query (similarity terms are ignored).
 *
 * @param {string} originalQueryString
 * @param {object} options
 * @param {number[]} [options.trackIds] only consider these tracks
 * @param {number} [options.limit] at most this many ids, newest first
 * @returns {Promise<number[]>}
 */
module.exports.queryFilteredTrackIds = async (originalQueryString, { stores, addedSince, trackIds, limit } = {}) => {
  const filters = parseSearchFilters(stripSimilarityTerms(originalQueryString))
  if (filters.hasUnresolvedEntityFilter) return []
  if (trackIds && trackIds.length === 0) return []
  return BPromise.using(pg.getTransaction(), async (tx) => {
    // language=PostgreSQL
    const query = sql`-- queryFilteredTrackIds
SELECT track_id
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store
`
    // The names are only needed for the free-text match.
    if (filters.queryString !== '') {
      // language=PostgreSQL
      query.append(sql`
  NATURAL JOIN track__artist
  NATURAL JOIN artist
  NATURAL LEFT JOIN track__label
  NATURAL LEFT JOIN label
  NATURAL LEFT JOIN release__track
  NATURAL LEFT JOIN release
`)
    }
    R.intersperse(' ', filters.fuzzyFilterJoins).forEach((join) => query.append(join))
    // language=PostgreSQL
    query.append(sql`
WHERE (${addedSince || null}::TIMESTAMPTZ IS NULL OR track_added > ${addedSince || null}::TIMESTAMPTZ)
  AND (${stores} :: TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))
  AND (${trackIds || null}::INT[] IS NULL OR track.track_id = ANY(${trackIds || null}::INT[]))`)
    appendFieldFilters(query, tx, filters)
    query.append(` GROUP BY track_id, track_title, track_version `)
    appendTextFilter(query, filters)
    query.append(` ORDER BY track_id DESC `)
    if (limit) query.append(sql` LIMIT ${limit}`)
    return (await tx.queryRowsAsync(query)).map(({ track_id }) => track_id)
  })
}

const CART_SEARCH_TERM = /cart:~([0-9a-f-]{36})/i

// cart:~<uuid> searches by a whole cart: the cart is split into groups of similar tracks and each group is searched
// separately. The other terms of the query filter the results. Returns the Fit-ordered tracks and the grouping, or
// undefined when the query has no cart term.
const searchByCart = async (
  originalQueryString,
  { offset, userId, addedSince, stores, k, newArtistsOnly, misses } = {},
) => {
  const cartUuid = originalQueryString.match(CART_SEARCH_TERM)?.[1]
  if (!cartUuid) return undefined
  // Every result is returned at once, ordered by Fit; there is no further page.
  if (parseInt(offset, 10) > 0) return { tracks: [], cartSearch: null }
  const { searchSimilarToCart } = require('../cart-similarity')
  try {
    const { tracks, ...cartSearch } = await searchSimilarToCart({
      userId,
      cartUuid,
      k,
      newArtistsOnly,
      misses,
      query: originalQueryString,
      stores,
      addedSince,
    })
    return { tracks, cartSearch }
  } catch (e) {
    if (e instanceof NotFound) return { tracks: [], cartSearch: null }
    throw e
  }
}

/**
 * Track search response in an envelope like the track lists' (`GET /api/me/tracks`):
 * `{ tracks, meta: { total, offset, limit, count } }`. `total` is the number of matching tracks, `offset` and `limit`
 * the page that was fetched and `count` the number of tracks on it.
 *
 * A cart search (cart:~<uuid>) returns every result at once, ordered by Fit: `limit` is the most results it can
 * return (results per group × groups) and `meta.cartSearch` holds the groups, the map and the excluded counts (null
 * when the cart is not found).
 */
module.exports.searchForTracksResponse = async (originalQueryString, options = {}) => {
  const cart = await searchByCart(originalQueryString, options)
  if (cart) {
    const { tracks, cartSearch } = cart
    const offset = parseInt(options.offset, 10) || 0
    const limit = cartSearch ? cartSearch.limitPerGroup * cartSearch.k : 0
    return { tracks, meta: { total: tracks.length, offset, limit, count: tracks.length, cartSearch } }
  }
  const { tracks, total, limit, offset } = await searchTrackPage(originalQueryString, options)
  return { tracks, meta: { total, offset, limit, count: tracks.length } }
}

module.exports.searchForTracks = async (originalQueryString, options = {}) => {
  const cartSearch = await searchByCart(originalQueryString, options)
  if (cartSearch) return cartSearch.tracks
  return (await searchTrackPage(originalQueryString, options)).tracks
}

// One page of a (non-cart) track search and the total number of matching tracks. The total is counted with the same
// filters in a separate query that runs alongside the page query.
const searchTrackPage = async (
  originalQueryString,
  { limit: l, offset: o, sort: s, userId, addedSince, onlyNew, stores = undefined } = {},
) => {
  const addedSinceValue = addedSince || null
  const similaritySearchTrackId = originalQueryString.match(/track:~(\d+)/)?.[1]
  const sampleSearchId = originalQueryString.match(/sample:~(\d+)/)?.[1]
  const useMatchScoreSort = Boolean(sampleSearchId) && !s

  // Hardcoded production embedding type: the only type currently generated for previews.
  // Filtering on it keeps cross-model vectors from being compared and makes the reference
  // selection deterministic.
  const PRODUCTION_EMBEDDING_TYPE = 'discogs_multi_embeddings-effnet-bs64-1'

  // Candidate pool size for the two-phase ANN similarity search. Phase one pulls the N
  // nearest preview embeddings via the HNSW index; the catalogue joins and user filters
  // (store / onlyNew / text / bpm / key / id) are applied afterwards, so the pool is sized
  // larger than a result page to keep recall reasonable when filters are selective. Raise
  // this (and consider SET LOCAL hnsw.ef_search) if narrow filters start returning short pages.
  const ANN_CANDIDATE_POOL_SIZE = 1000

  const limit = parseInt(l, 10) || 100
  const offset = parseInt(o, 10) || 0

  const filters = parseSearchFilters(originalQueryString)
  const { hasUnresolvedEntityFilter, fuzzyFilterJoins } = filters
  if (hasUnresolvedEntityFilter) return { tracks: [], total: 0, limit, offset }
  const sortParameters = getSortParameters(s || '-released')
  const sortColumns = sortParameters
    .map(([alias, order]) => {
      const column = aliasToColumn[alias]
      return column ? [column, order] : null
    })
    .filter((i) => i)

  // Builds the page query, or with `count` the query that counts every matching track (no sorting or paging).
  const buildQuery = (tx, { count }) => {
    // The joins and WHERE conditions of a non-similarity search, shared by the page and the count.
    const appendMatchFilters = (query) => {
      R.intersperse(' ', fuzzyFilterJoins).forEach((join) => query.append(join))
      // language=PostgreSQL
      query.append(sql`
 WHERE
(${addedSinceValue}::TIMESTAMPTZ IS NULL OR track_added > ${addedSinceValue}::TIMESTAMPTZ)
AND (${Boolean(onlyNew)}::BOOLEAN <> TRUE OR user__track_heard IS NULL)
AND (meta_account_user_id = ${userId}::INT OR meta_account_user_id IS NULL)
AND (${stores} :: TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))
         `)
      if (sampleSearchId) {
        query.append(sql` AND track_id IN (SELECT track_id FROM sample_match_score) `)
      }
      appendFieldFilters(query, tx, filters)
    }

    // language=PostgreSQL
    let query = sql`
      -- searchForSimilarTracks
WITH logged_user AS (SELECT ${userId}::INT AS meta_account_user_id)
`

    if (sampleSearchId) {
      // Per-sample track → max(match_score) lookup, ownership-gated via NATURAL JOIN
      // on user_notification_audio_sample. A non-owned sample id yields zero rows here
      // and the downstream `track_id IN (...)` filter returns an empty result set
      // (no 403), matching the existing `track:~<id>` posture.
      query.append(sql`
, sample_match_score AS
  (SELECT track_id, MAX(user_notification_audio_sample_match_score) AS max_score
   FROM
     user_notification_audio_sample_match m
     NATURAL JOIN store__track_preview
     NATURAL JOIN store__track
     NATURAL JOIN user_notification_audio_sample uns
   WHERE m.user_notification_audio_sample_id = ${sampleSearchId}::INT
     AND uns.meta_account_user_id = ${userId}::INT
   GROUP BY track_id)
`)
    }

    if (similaritySearchTrackId) {
      // Two-phase ANN. Phase one (ann_candidates) pulls the nearest preview embeddings
      // using the HNSW index (idx_store__track_preview_embedding_hnsw_cosine). A bare
      // `ORDER BY embedding <=> reference LIMIT N` is the only shape pgvector's HNSW index
      // can accelerate — the previous single-CTE version wrapped the distance in
      // MIN()/GROUP BY and placed the catalogue joins ahead of the ORDER BY, which forced a
      // full sequential scan of the (now large) embedding table. Phase two (similar_tracks)
      // applies the catalogue joins and user filters to just the candidate pool and collapses
      // previews to tracks via MIN(similarity).
      // language=PostgreSQL
      query.append(sql`
, reference AS
  (SELECT store__track_preview_embedding AS reference_embedding
   FROM
     store__track_preview_embedding
     NATURAL JOIN store__track_preview
     NATURAL JOIN store__track
   WHERE track_id = ${similaritySearchTrackId}
     AND store__track_preview_embedding_type = ${PRODUCTION_EMBEDDING_TYPE}
   LIMIT 1)
 , ann_candidates AS
  (SELECT store__track_preview_id
        , store__track_preview_embedding <=> (SELECT reference_embedding FROM reference) AS similarity
   FROM store__track_preview_embedding
   WHERE store__track_preview_embedding_type = ${PRODUCTION_EMBEDDING_TYPE}
   ORDER BY store__track_preview_embedding <=> (SELECT reference_embedding FROM reference)
   LIMIT ${ANN_CANDIDATE_POOL_SIZE})
 , similar_tracks AS
  (SELECT track_id
        , MIN(similarity) AS similarity
   FROM
     ann_candidates
     NATURAL JOIN store__track_preview
     NATURAL JOIN store__track
     NATURAL JOIN track
     NATURAL JOIN store
     NATURAL JOIN track__artist
     NATURAL JOIN artist
     NATURAL LEFT JOIN track__label
     NATURAL LEFT JOIN label
     NATURAL LEFT JOIN release__track
     NATURAL LEFT JOIN release
     `)

      R.intersperse(' ', fuzzyFilterJoins).forEach((join) => query.append(join))

      // language=PostgreSQL
      query.append(sql`
     NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
   WHERE (${addedSinceValue}::TIMESTAMPTZ IS NULL OR track_added > ${addedSinceValue}::TIMESTAMPTZ)
     AND (${Boolean(onlyNew)}::BOOLEAN <> TRUE OR user__track_heard IS NULL OR track_id = ${similaritySearchTrackId})
     AND (meta_account_user_id = ${userId}::INT OR meta_account_user_id IS NULL)
     AND (${stores} :: TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))`)

      appendFieldFilters(query, tx, filters)

      // language=PostgreSQL
      query.append(sql`
   GROUP BY track_id, user__track_heard`)

      appendTextFilter(query, filters)

      if (count) {
        query.append(sql`)
SELECT COUNT(*)::INT AS total FROM similar_tracks`)
        return query
      }

      query.append(sql`
   ORDER BY MIN(similarity) NULLS LAST
   LIMIT ${limit} OFFSET ${offset})
`)
    }

    if (count && !similaritySearchTrackId) {
      query.append(sql`--countSearchMatches
SELECT COUNT(DISTINCT track_id)::INT AS total
FROM (SELECT track_id
      FROM
        track
        NATURAL JOIN track__artist
        NATURAL JOIN artist
        NATURAL JOIN store__track
        NATURAL JOIN store
        NATURAL LEFT JOIN track__label
        NATURAL LEFT JOIN label
        NATURAL LEFT JOIN release__track
        NATURAL LEFT JOIN release
        NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
`)
      appendMatchFilters(query)
      query.append(sql` GROUP BY track_id, track_title, track_version `)
      appendTextFilter(query, filters)
      query.append(sql`) matches`)
      return query
    }

    query.append(sql`--searchForTracks
SELECT track_id          AS id
     , td.*
     , user__track_heard AS heard
     , COALESCE(user_track_carts.carts, '[]'::JSON) AS carts`)

    if (similaritySearchTrackId) {
      query.append(sql`, similarity `)
    }

    query.append(sql`
FROM
  track_details
  JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE, artists JSON
                                           , version TEXT, labels JSON, remixers JSON, releases JSON, keys JSON
                                           , genres JSON, previews JSON, stores JSON, released DATE, published DATE
                                           , source_details JSON)
       USING (track_id)
  NATURAL LEFT JOIN (
    user__track NATURAL JOIN logged_user
  )
  LEFT JOIN (
    SELECT track_id, JSON_AGG(JSON_BUILD_OBJECT('uuid', cart_uuid)) AS carts
    FROM track__cart NATURAL JOIN cart
    WHERE cart.meta_account_user_id = ${userId} AND cart_deleted IS NULL
    GROUP BY track_id
  ) user_track_carts USING (track_id)
`)

    if (useMatchScoreSort) {
      query.append(sql` LEFT JOIN sample_match_score USING (track_id) `)
    }

    if (similaritySearchTrackId) {
      query.append(sql` NATURAL JOIN similar_tracks
      ORDER BY similarity NULLS LAST `)
    } else {
      query.append(sql`
 WHERE track_id IN
      (SELECT track_id
       FROM
         track
         NATURAL JOIN track__artist
         NATURAL JOIN artist
         NATURAL JOIN store__track
         NATURAL JOIN store
         NATURAL LEFT JOIN track__label
         NATURAL LEFT JOIN label
         NATURAL LEFT JOIN release__track
         NATURAL LEFT JOIN release
         NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
 `)

      if (useMatchScoreSort) {
        query.append(sql` LEFT JOIN sample_match_score USING (track_id) `)
      }

      appendMatchFilters(query)

      query.append(sql` GROUP BY track_id, track_title, track_version `)

      if (useMatchScoreSort) {
        query.append(`, max_score`)
      }

      sortColumns.forEach(([column]) => query.append(`, ${tx.escapeIdentifier(column)}`))
      appendTextFilter(query, filters)

      query.append(` ORDER BY `)
      if (useMatchScoreSort) {
        query.append(' MAX(max_score) DESC NULLS LAST, ')
      } else {
        sortColumns.forEach(([column, order]) =>
          query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
        )
      }
      query.append(sql` track_id DESC
        LIMIT ${limit} OFFSET ${offset})
        ORDER BY `)

      if (useMatchScoreSort) {
        query.append(' max_score DESC NULLS LAST, ')
      } else {
        sortParameters.forEach(([column, order]) =>
          query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
        )
      }
      query.append(' track_id DESC')
    }

    return query
  }

  // The transactions are only used for escapeIdentifier; the page and the count run in parallel.
  const run = (count) => BPromise.using(pg.getTransaction(), (tx) => tx.queryRowsAsync(buildQuery(tx, { count })))
  const [tracks, [{ total } = { total: 0 }]] = await Promise.all([run(false), run(true)])
  return { tracks, total, limit, offset }
}

const getSortParameters = (module.exports.getSortParameters = (sort) => {
  return sort
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s[0] === '-' ? [s.slice(1), 'DESC'] : [s, 'ASC']))
})
