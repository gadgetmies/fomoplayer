const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../../db/pg.js')
const logger = require('../../logger')(__filename)
const { using } = require('bluebird')

module.exports.mergeTracks = async ({ trackToBeDeleted, trackToKeep }) => {
  await pg.queryAsync(sql`
-- Merge tracks
SELECT merge_tracks(${trackToBeDeleted}, ${trackToKeep});
  `)
}
