const sql = require('sql-template-strings')
const pgrm = require('fomoplayer_shared').db.pg

const consumeHandoffJti = async (jti, expiresAt) => {
  if (!jti || !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    return false
  }
  const result = await pgrm.queryAsync(
    //language=PostgreSQL
    sql`INSERT INTO auth_handoff_jti (auth_handoff_jti_value, auth_handoff_jti_expires_at)
        VALUES (${jti}, ${expiresAt.toISOString()})
        ON CONFLICT (auth_handoff_jti_value) DO NOTHING`,
  )
  return result.rowCount === 1
}

module.exports = { consumeHandoffJti }
