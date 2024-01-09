const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { using } = require('bluebird')
//const logger = require('../../../logger')(__filename)

// TODO: would it be possible to somehow derive these from the track_details function?
const aliasToColumn = {
  published: 'store__track_published',
  released: 'store__track_released',
  added: 'track_added',
  title: 'track_title',
  heard: 'user__track_heard'
}

module.exports.searchForTracks = async (queryString, { limit: l, sort: s, userId, addedSince } = {}) => {
  const idFilter = queryString
    .split(' ')
    .filter(s => s.includes(':'))
    .map(s => s.split(':'))
    .filter(([key]) => ['artist', 'label', 'release'].includes(key))[0]

  const limit = l || 100
  const sort = s || '-released'
  const sortParameters = getSortParameters(sort)
  const sortColumns = sortParameters
    .map(([alias, order]) => {
      const column = aliasToColumn[alias]
      return column ? [column, order] : null
    })
    .filter(i => i)

  return using(pg.getTransaction(), async tx => {
    // TODO: this tx is only here for escapeIdentifier -> find out a way to get the function from pg
    let query =
      // language=PostgreSQL
      sql`-- searchForTracks
SELECT track_id          AS id
     , td.*
     , user__track_heard AS heard
FROM
  track_details
  JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE, artists JSON
                                           , version TEXT, labels JSON, remixers JSON, releases JSON, keys JSON
                                           , previews JSON, stores JSON, released DATE, published DATE)
       USING (track_id)
  NATURAL LEFT JOIN
    (SELECT track_id, user__track_heard
     FROM
       user__track
     WHERE meta_account_user_id = ${userId} :: INT) ut

WHERE track_id IN
      (SELECT track_id
       FROM
         track
         NATURAL JOIN track__artist
         NATURAL JOIN artist
         NATURAL LEFT JOIN track__label
         NATURAL LEFT JOIN label
         LEFT JOIN release__track USING (track_id)
         LEFT JOIN release USING (release_id)
         NATURAL JOIN store__track`

    query.append(sql` WHERE (${addedSince}::TIMESTAMPTZ IS NULL
          OR track_added > ${addedSince}::TIMESTAMPTZ)`)

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
      query
        .append(tx.escapeIdentifier(column))
        .append(' ')
        .append(order)
        .append(' NULLS LAST, ')
    )
    query.append(` track_id DESC
        LIMIT ${limit})
        ORDER BY `)

    sortParameters.forEach(([column, order]) =>
      query
        .append(tx.escapeIdentifier(column))
        .append(' ')
        .append(order)
        .append(' NULLS LAST, ')
    )
    query.append(' track_id DESC')

    return await tx.queryRowsAsync(query)
  })
}

const getSortParameters = (module.exports.getSortParameters = sort => {
  return sort
    .split(',')
    .map(s => s.trim())
    .map(s => (s[0] === '-' ? [s.slice(1), 'DESC'] : [s, 'ASC']))
})
