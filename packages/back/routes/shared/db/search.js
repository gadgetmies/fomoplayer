const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
//const logger = require('../../../logger')(__filename)

// TODO: would it be possible to somehow derive these from the track_details function?
const aliasToColumn = {
  published: 'store__track_published',
  released: 'store__track_released',
  added: 'track_added',
  title: 'track_title',
  heard: 'user__track_heard',
}

module.exports.searchForTracks = async (queryString, { limit: l, sort: s, userId, addedSince, onlyNew, store = undefined } = {}) => {
  const addedSinceValue = addedSince || null
  const idFilter = queryString
    .split(' ')
    .filter((s) => s.includes(':'))
    .map((s) => s.split(':'))
    .filter(([key]) => ['artist', 'label', 'release'].includes(key))[0]

  const similaritySearchTrackId = queryString.match(/track:~(\d+)/)?.[1]

  const limit = l || 100
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
WITH logged_user AS (SELECT ${userId}::INT AS meta_account_user_id)
`

    if (similaritySearchTrackId) {
      query.append(sql`-- searchForSimilarTracks
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
     NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
   WHERE (${addedSinceValue}::TIMESTAMPTZ IS NULL OR track_added > ${addedSinceValue}::TIMESTAMPTZ)
     AND (${Boolean(onlyNew)}::BOOLEAN <> TRUE OR user__track_heard IS NULL OR track_id = ${similaritySearchTrackId})
     AND (meta_account_user_id = ${userId}::INT OR meta_account_user_id IS NULL)
     AND (${store} :: TEXT IS NULL OR LOWER(store_name) = ${store})
   GROUP BY track_id, user__track_heard
   ORDER BY MIN(store__track_preview_embedding <-> (SELECT store__track_preview_embedding FROM reference)) NULLS LAST
   LIMIT ${limit})
`)
    }

    query.append(sql`--searchForTracks
SELECT track_id          AS id
     , td.*
     , user__track_heard AS heard`)

    if (similaritySearchTrackId) {
      query.append(`, similarity `)
    }

    query.append(sql`
FROM
  track_details
  JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE, artists JSON
                                           , version TEXT, labels JSON, remixers JSON, releases JSON, keys JSON
                                           , previews JSON, stores JSON, released DATE, published DATE)
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
         NATURAL LEFT JOIN track__label
         NATURAL LEFT JOIN label
         NATURAL LEFT JOIN release__track
         NATURAL LEFT JOIN release
         NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
 WHERE 
(${addedSinceValue}::TIMESTAMPTZ IS NULL OR track_added > ${addedSinceValue}::TIMESTAMPTZ)
AND (${Boolean(onlyNew)}::BOOLEAN <> TRUE OR user__track_heard IS NULL)
AND (meta_account_user_id = ${userId}::INT OR meta_account_user_id IS NULL)
AND (${store} :: TEXT IS NULL OR LOWER(store_name) = ${store})
         `)
      
      if (idFilter) {
        query.append(` AND ${tx.escapeIdentifier(`${idFilter[0]}_id`)} = `)
        query.append(sql`${idFilter[1]}`)
      }

      query.append(` GROUP BY track_id, track_title, track_version `)

      sortColumns.forEach(([column]) => query.append(`, ${tx.escapeIdentifier(column)}`))
      !idFilter &&
        query.append(sql` HAVING
                                  TO_TSVECTOR(
                                          'simple',
                                          unaccent(track_title || ' ' ||
                                                   COALESCE(track_version, '') || ' ' ||
                                                   STRING_AGG(artist_name, ' ') || ' ' ||
                                                   STRING_AGG(release_name, ' ') || ' ' ||
                                                   STRING_AGG(COALESCE(label_name, ''), ' '))) @@
                                  websearch_to_tsquery('simple', unaccent(${queryString}))`)

      query.append(` ORDER BY `)
      sortColumns.forEach(([column, order]) =>
        query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
      )
      query.append(` track_id DESC
        LIMIT ${limit})
        ORDER BY `)

      sortParameters.forEach(([column, order]) =>
        query.append(tx.escapeIdentifier(column)).append(' ').append(order).append(' NULLS LAST, '),
      )
      query.append(' track_id DESC')
    }

    console.log(query.text, query.values)

    return tx.queryRowsAsync(query)
  })
}

const getSortParameters = (module.exports.getSortParameters = (sort) => {
  return sort
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s[0] === '-' ? [s.slice(1), 'DESC'] : [s, 'ASC']))
})
