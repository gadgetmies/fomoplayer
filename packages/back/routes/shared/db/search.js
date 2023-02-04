const pg = require('../../../db/pg.js')
const sql = require('sql-template-strings')
const { using } = require('bluebird')

module.exports.searchForTracks = async (queryString, { limit: l, sort: s, userId } = {}) => {
  const limit = l || 100
  const sort = s || '-released'
  return using(pg.getTransaction(), async tx => {
    // TODO: this tx is only here for escapeIdentifier -> find out a way to get the function from pg
    let query =
      // language=PostgreSQL
      sql`-- searchForTracks
        SELECT
            track_id AS id
          , td.*
          , user__track_heard AS heard
        FROM
            track_details(
                    (SELECT
                         ARRAY_AGG(track_id)
                     FROM
                         (SELECT
                              track_id
                          FROM
                              track
                                  NATURAL JOIN track__artist
                                  NATURAL JOIN artist
                                  NATURAL LEFT JOIN track__label
                                  NATURAL LEFT JOIN label
                                  NATURAL JOIN store__track
                          GROUP BY track_id, track_title, track_version
                          HAVING
                                  TO_TSVECTOR(
                                          'simple',
                                          unaccent(track_title || ' ' ||
                                                   COALESCE(track_version, '') || ' ' ||
                                                   STRING_AGG(artist_name, ' ') || ' ' ||
                                                   STRING_AGG(COALESCE(label_name, ''), ' '))) @@
                                  websearch_to_tsquery('simple', unaccent(${queryString}))
                          ORDER BY MAX(LEAST(store__track_published, store__track_released)) DESC
                          LIMIT ${limit}
                         ) AS tracks)) td
        NATURAL LEFT JOIN
            (
                SELECT track_id, user__track_heard
                FROM user__track
                WHERE meta_account_user_id = ${userId} :: INT
            ) ut
        ORDER BY `

    const sortParameters = getSortParameters(sort)
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
    .map(s => [s.slice(1), s[0] === '+' ? 'ASC' : 'DESC'])
})
