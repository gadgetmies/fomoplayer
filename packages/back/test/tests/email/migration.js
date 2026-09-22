const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')
const BPromise = require('bluebird')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

const { initDb } = require('../../lib/db')
const { suppress, unsuppress } = require('../../../services/email-unsubscribe')

const SQL_DIR = path.resolve(__dirname, '../../../migrations/sqls')
const readSql = (name) => fs.readFileSync(path.join(SQL_DIR, name), 'utf8')

const columnNames = async (table) => {
  const rows = await pg.queryRowsAsync(
    sql`SELECT column_name AS name FROM information_schema.columns WHERE table_name = ${table}`,
  )
  return rows.map((r) => r.name)
}

test({
  setup: async () => {
    await initDb()
  },

  'email migrations': {
    'email_unsubscribe and email_queue columns are present after migration': async () => {
      const unsubCols = await columnNames('email_unsubscribe')
      for (const c of [
        'email_unsubscribe_id',
        'email_unsubscribe_address',
        'email_unsubscribe_created_at',
        'email_unsubscribe_source',
      ]) {
        assert.ok(unsubCols.includes(c), `missing ${c}`)
      }
      const queueCols = await columnNames('email_queue')
      for (const c of [
        'email_queue_category',
        'email_queue_skipped_reason',
        'email_queue_provider_message_id',
      ]) {
        assert.ok(queueCols.includes(c), `missing ${c}`)
      }
    },

    'address is unique and case-insensitive (idempotent suppression)': async () => {
      await unsuppress('Case@Example.com')
      await suppress('Case@Example.com', 'a')
      await suppress('case@example.com', 'b') // same address, different case → no-op
      const rows = await pg.queryRowsAsync(
        sql`SELECT count(*)::int AS n FROM email_unsubscribe WHERE email_unsubscribe_address = 'case@EXAMPLE.com'`,
      )
      assert.equal(rows[0].n, 1, 'a single case-insensitive suppression row exists')
      await unsuppress('Case@Example.com')
    },

    'NATURAL JOIN sanity: email_queue and email_unsubscribe share no column names': async () => {
      const queueCols = new Set(await columnNames('email_queue'))
      const unsubCols = await columnNames('email_unsubscribe')
      const shared = unsubCols.filter((c) => queueCols.has(c))
      assert.deepEqual(shared, [], `unexpected shared columns would break NATURAL JOINs: ${shared}`)
    },

    'down + up SQL round-trips cleanly (rolled back)': async () => {
      const ROLLBACK = new Error('__rollback__')
      try {
        await BPromise.using(pg.getTransaction(), async (tx) => {
          await tx.queryAsync(readSql('20260922120100-add-email-queue-category-columns-down.sql'))
          await tx.queryAsync(readSql('20260922120000-add-email-unsubscribe-down.sql'))
          await tx.queryAsync(readSql('20260922120000-add-email-unsubscribe-up.sql'))
          await tx.queryAsync(readSql('20260922120100-add-email-queue-category-columns-up.sql'))
          throw ROLLBACK
        })
      } catch (e) {
        if (e !== ROLLBACK) throw e
      }
      // Schema is intact after rollback.
      const queueCols = await columnNames('email_queue')
      assert.ok(queueCols.includes('email_queue_category'))
    },
  },
})
