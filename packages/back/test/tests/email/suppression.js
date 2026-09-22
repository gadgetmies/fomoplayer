const assert = require('assert')
const { test } = require('cascade-test')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

const { initDb } = require('../../lib/db')
const { scheduleEmail, sendNextEmailBatch } = require('../../../services/mailer')
const { suppress, unsuppress } = require('../../../services/email-unsubscribe')

const SUPPRESSED = 'suppressed-listener@example.com'
const ALLOWED = 'allowed-listener@example.com'
const SENDER = 'noreply@fomoplayer.com'

// Records every send instead of hitting Resend / the mock endpoint.
const recordingTransport = (sends) => async (payload) => {
  sends.push(payload)
  return { data: { id: `rec-${payload.idempotencyKey}` }, error: null }
}

const rowFor = async (recipient, category) => {
  const rows = await pg.queryRowsAsync(
    sql`SELECT email_queue_sent AS sent, email_queue_skipped_reason AS skipped,
               email_queue_provider_message_id AS "providerId"
        FROM email_queue
        WHERE email_queue_recipient = ${recipient} AND email_queue_category = ${category}
        ORDER BY email_queue_id DESC LIMIT 1`,
  )
  return rows[0]
}

test({
  setup: async () => {
    await initDb()
    // Isolate the queue for this suite and ensure a high batch limit.
    process.env.EMAIL_SEND_BATCH = '100'
    await pg.queryAsync(sql`DELETE FROM email_queue WHERE email_queue_sent IS NULL`)
    await unsuppress(SUPPRESSED)
    await suppress(SUPPRESSED, 'test-setup')

    await scheduleEmail(SENDER, SUPPRESSED, 'notif', 'body', 'body', 'notification')
    await scheduleEmail(SENDER, ALLOWED, 'notif', 'body', 'body', 'notification')
    await scheduleEmail(SENDER, SUPPRESSED, 'verify', 'body', 'body', 'verification')
  },

  teardown: async () => {
    await pg.queryAsync(
      sql`DELETE FROM email_queue WHERE email_queue_recipient IN (${SUPPRESSED}, ${ALLOWED})`,
    )
    await unsuppress(SUPPRESSED)
  },

  'send-time suppression': {
    'skips suppressed notification, sends allowed notification, and bypasses for verification': async () => {
      const sends = []
      await sendNextEmailBatch({ transport: recordingTransport(sends) })

      const suppressedNotif = await rowFor(SUPPRESSED, 'notification')
      assert.equal(suppressedNotif.sent, null, 'suppressed notification not sent')
      assert.equal(suppressedNotif.skipped, 'suppressed', 'suppressed notification marked')

      const allowedNotif = await rowFor(ALLOWED, 'notification')
      assert.ok(allowedNotif.sent, 'allowed notification sent')
      assert.ok(allowedNotif.providerId, 'allowed notification stored provider id')

      const verify = await rowFor(SUPPRESSED, 'verification')
      assert.ok(verify.sent, 'verification bypasses suppression and is sent')

      const recipients = sends.map((s) => s.to)
      assert.ok(recipients.includes(ALLOWED), 'allowed recipient was sent')
      assert.ok(recipients.includes(SUPPRESSED), 'verification to suppressed addr was sent')
      assert.equal(
        recipients.filter((r) => r === SUPPRESSED).length,
        1,
        'suppressed address only received the exempt verification email',
      )
    },
  },
})
