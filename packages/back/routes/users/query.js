'use strict'
const router = require('express-promise-router')()
const { Parser } = require('node-sql-parser')
const { pool } = require('fomoplayer_shared').db.pg
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

const MAX_ROWS = 500
const EXPOSED_TABLES = [
  'artist','artist__genre','cart','cart__store','genre','key','key_name','key_system',
  'label','playlist','release','release__track','source','store','store__artist',
  'store__artist_watch','store__artist_watch__user','store__genre','store__label',
  'store__label_watch','store__label_watch__user','store__release','store__track',
  'store__track_preview','store__track_preview_embedding','store__track_preview_fingerprint',
  'store__track_preview_fingerprint_meta','store__track_preview_waveform','store_playlist_type',
  'track','track__artist','track__cart','track__genre','track__key','track__label',
  'track_details','user__artist__label_ignore','user__artist_ignore','user__label_ignore',
  'user__playlist_watch','user__release_ignore','user__track','user_notification_audio_sample',
  'user_notification_audio_sample_embedding','user_notification_audio_sample_fingerprint',
  'user_notification_audio_sample_fingerprint_meta','user_search_notification',
  'user_search_notification__store','user_track_score_weight',
]

const isSelectOnly = (userSql) => {
  try {
    const parser = new Parser()
    const ast = parser.astify(userSql, { database: 'PostgreSQL' })
    const stmts = Array.isArray(ast) ? ast : [ast]
    if (!stmts.every((s) => s.type === 'select')) return false
    // Reject writable CTEs: WITH x AS (INSERT/UPDATE/DELETE ...) SELECT ...
    return stmts.every(
      (s) => !s.with || s.with.every((cte) => cte.stmt?.type === 'select'),
    )
  } catch { return false }
}

router.get('/schema', async (req, res) => {
  const rows = await pg.queryRowsAsync(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${EXPOSED_TABLES})
    ORDER BY table_name, ordinal_position
  `)
  const schema = {}
  for (const { table_name, column_name, data_type } of rows) {
    if (!schema[table_name]) schema[table_name] = []
    schema[table_name].push({ column: column_name, type: data_type })
  }
  res.json(schema)
})

router.post('/', async ({ user: { id: userId }, body: { sql: userSql } }, res) => {
  if (!userSql || typeof userSql !== 'string') return res.status(400).json({ error: 'sql is required' })
  if (!isSelectOnly(userSql)) return res.status(400).json({ error: 'Only SELECT statements are allowed' })
  // Strip trailing semicolons and wrap with a server-side LIMIT to prevent memory exhaustion
  const safeUserSql = userSql.trimEnd().replace(/;+\s*$/, '')
  const limitedSql = `SELECT * FROM (${safeUserSql}) AS _q LIMIT ${MAX_ROWS + 1}`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE fomoplayer_query')
    await client.query('SET TRANSACTION READ ONLY')
    await client.query("SET LOCAL statement_timeout = '3s'")
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)])
    const result = await client.query(limitedSql)
    await client.query('COMMIT')
    const rows = result.rows.slice(0, MAX_ROWS)
    return res.json({ rows, truncated: result.rows.length > MAX_ROWS })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    logger.warn('Query endpoint error', { message: err?.message })
    if (err.code === '57014') return res.status(408).json({ error: 'Query timed out' })
    return res.status(400).json({ error: 'Query execution failed' })
  } finally {
    client.release()
  }
})

module.exports = router
