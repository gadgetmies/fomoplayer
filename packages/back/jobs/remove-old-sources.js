const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.removeOldSources = () => pg.queryAsync(sql`-- removeOldSources
DELETE
FROM
  source
WHERE source_id IN (SELECT source_id FROM source WHERE source_added < NOW() - INTERVAL '4 months' LIMIT 200)
;
`)
