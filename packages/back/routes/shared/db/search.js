const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)

const SINGLE_VALUE_FILTER_KEYS = new Set(['label', 'release', 'track', 'bpm', 'key', 'genre'])

const deduplicateFieldFilters = (fieldFilters) => {
  const seenKeys = new Set()
  return fieldFilters.filter(([key]) => {
    if (!SINGLE_VALUE_FILTER_KEYS.has(key)) return true
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}

const appendIdFilters = (queryBuilder, idFilters, tx) => {
  const idFilterToTable = {
    artist: 'track__artist',
    label: 'track__label',
    release: 'release__track',
  }
  const artistFilters = idFilters.filter(([k]) => k === 'artist')
  const otherIdFilters = idFilters.filter(([k]) => k !== 'artist')

  if (artistFilters.length > 0) {
    queryBuilder.append(' AND (')
    artistFilters.forEach(([key, value], i) => {
      if (i > 0) queryBuilder.append(' AND ')
      const junctionTable = idFilterToTable[key]
      queryBuilder.append(
        `EXISTS (SELECT 1 FROM ${tx.escapeIdentifier(junctionTable)} t2 WHERE t2.track_id = track.track_id AND t2.${tx.escapeIdentifier(
          `${key}_id`,
        )} = `,
      )
      queryBuilder.append(sql`${value}`)
      queryBuilder.append(`)`)
    })
    queryBuilder.append(')')
  }

  for (const idFilter of otherIdFilters) {
    if (idFilter[0] === 'track') {
      queryBuilder.append(sql` AND track.track_id = ${idFilter[1]}`)
    } else {
      const junctionTable = idFilterToTable[idFilter[0]]
      queryBuilder.append(
        ` AND EXISTS (SELECT 1 FROM ${tx.escapeIdentifier(junctionTable)} t2 WHERE t2.track_id = track.track_id AND t2.${tx.escapeIdentifier(
          `${idFilter[0]}_id`,
        )} = `,
      )
      queryBuilder.append(sql`${idFilter[1]}`)
      queryBuilder.append(`)`)
    }
  }
}

// TODO: would it be possible to somehow derive these from the track_details function?
const aliasToColumn = {
  published: 'store__track_published',
  released: 'store__track_released',
  added: 'track_added',
  title: 'track_title',
  heard: 'user__track_heard',
}

module.exports.searchForTracks = async (
  originalQueryString,
  { limit: l, offset: o, sort: s, userId, addedSince, onlyNew, stores = undefined } = {},
) => {
  const addedSinceValue = addedSince || null
  const fieldFilters = deduplicateFieldFilters(
    originalQueryString.match(/(\S+:\S+)+?/g)?.map((s) => s.split(':')) || [],
  )
  const similaritySearchTrackId = originalQueryString.match(/track:~(\d+)/)?.[1]

  const queryString = originalQueryString.replace(/(\S+:\S+)\s*/g, '').trim()

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
  const appendAndFilters = (queryBuilder, filterGroups) => {
    filterGroups.forEach((filters) => {
      if (filters.length > 0) {
        queryBuilder.append(' AND ')
        R.intersperse(' AND ', filters).forEach((q) => queryBuilder.append(q))
      }
    })
  }

  const limit = l || 100
  const offset = o || 0
  const sortParameters = getSortParameters(s || '-released')
  const sortColumns = sortParameters
    .map(([alias, order]) => {
      const column = aliasToColumn[alias]
      return column ? [column, order] : null
    })
    .filter((i) => i)

  return BPromise.using(pg.getTransaction(), async (tx) => {
    // TODO: this tx is only here for escapeIdentifier -> find out a way to get the function from pg
    // language=PostgreSQL
    let query = sql`
      -- searchForSimilarTracks
WITH logged_user AS (SELECT ${userId}::INT AS meta_account_user_id)
`

    if (similaritySearchTrackId) {
      query.append(sql`
, reference AS
  (SELECT store__track_preview_embedding
   FROM
     store__track_preview_embedding
     NATURAL JOIN store__track_preview
     NATURAL JOIN store__track
   WHERE track_id = ${similaritySearchTrackId} LIMIT 1)
   , similar_tracks AS
  (SELECT track_id
        , MIN(store__track_preview_embedding <->
          (SELECT store__track_preview_embedding FROM reference)) AS similarity
   FROM
     store__track_preview_embedding
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

      if (fuzzyFilterQueries.length > 0) {
        query.append(' AND ')
        R.intersperse(' AND ', fuzzyFilterQueries).forEach((q) => query.append(q))
      }

      appendAndFilters(query, exactFilterGroups)

      appendIdFilters(query, idFilters, tx)

      // language=PostgreSQL
      query.append(sql`
   GROUP BY track_id, user__track_heard`)

      if (queryString !== '') {
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

      query.append(sql`
   ORDER BY MIN(store__track_preview_embedding <-> (SELECT store__track_preview_embedding FROM reference)) NULLS LAST
   LIMIT ${limit} OFFSET ${offset})
`)
    }

    query.append(sql`--searchForTracks
SELECT track_id          AS id
     , td.*
     , user__track_heard AS heard`)

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
`)

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

      R.intersperse(' ', fuzzyFilterJoins).forEach((join) => query.append(join))

      // language=PostgreSQL
      query.append(sql`
 WHERE 
(${addedSinceValue}::TIMESTAMPTZ IS NULL OR track_added > ${addedSinceValue}::TIMESTAMPTZ)
AND (${Boolean(onlyNew)}::BOOLEAN <> TRUE OR user__track_heard IS NULL)
AND (meta_account_user_id = ${userId}::INT OR meta_account_user_id IS NULL)
AND (${stores} :: TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))
         `)

      appendIdFilters(query, idFilters, tx)

      if (fuzzyFilters.length > 0) {
        query.append(' AND ')
        R.intersperse(' AND ', fuzzyFilterQueries).forEach((q) => query.append(q))
        query.append(' ')
      }

      appendAndFilters(query, exactFilterGroups)

      query.append(sql` GROUP BY track_id, track_title, track_version `)

      sortColumns.forEach(([column]) => query.append(`, ${tx.escapeIdentifier(column)}`))
      if (queryString !== '') {
        // Exclude the aggregated name fields for entity types that are already filtered by ID.
        // Otherwise e.g. artist:1 techno would match ALL tracks by "Techno Artist" because the
        // artist name itself contains "techno", making the text filter a no-op.
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

      query.append(` ORDER BY `)
      sortColumns.forEach(([column, order]) =>
        query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
      )
      query.append(` track_id DESC
        LIMIT ${limit} OFFSET ${offset})
        ORDER BY `)

      sortParameters.forEach(([column, order]) =>
        query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
      )
      query.append(' track_id DESC')
    }

    return tx.queryRowsAsync(query)
  })
}

const getSortParameters = (module.exports.getSortParameters = (sort) => {
  return sort
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s[0] === '-' ? [s.slice(1), 'DESC'] : [s, 'ASC']))
})
