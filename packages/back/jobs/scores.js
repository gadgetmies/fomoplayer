const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.updateDateAddedScore = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateDateAddedScore
    REFRESH MATERIALIZED VIEW track_date_added_score
    `
  )

  return { success: true }
}

module.exports.updateDateReleasedScore = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`--updateDateReleasedScore
    REFRESH MATERIALIZED VIEW track_date_released_score
    `
  )

  return { success: true }
}

module.exports.updateDatePublishedScore = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`--updateDateReleasedScore
    REFRESH MATERIALIZED VIEW track_date_published_score
    `
  )

  return { success: true }
}

module.exports.updatePurchasedScores = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`--updateDateReleasedScore
    REFRESH MATERIALIZED VIEW user_label_scores;
    `
  )
  await pg.queryAsync(
    // language=PostgreSQL
    sql`--updateDateReleasedScore
    REFRESH MATERIALIZED VIEW user_artist_scores;
    `
  )

  return { success: true }
}
