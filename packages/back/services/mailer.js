const pg = require('../db/pg.js')
const sql = require('sql-template-strings')
const { MessageClient } = require('cloudmailin')
const logger = require('../logger')(__filename)

const client = new MessageClient({
  username: process.env.CLOUDMAILIN_USERNAME,
  apiKey: process.env.CLOUDMAILIN_API_KEY
})

module.exports.scheduleEmail = async (sender, recipient, subject, plain, html) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO email_queue (email_queue_sender, email_queue_recipient, email_queue_subject, email_queue_plain,
                         email_queue_html)
VALUES (${sender}, ${recipient}, ${subject}, ${plain}, ${html})
`
  )
}

module.exports.sendNextEmailBatch = async () => {
  const emailsToSend = pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- sendNextBatch
SELECT email_queue_id        AS id,
       email_queue_sender    AS sender,
       email_queue_recipient AS recipient,
       email_queue_subject   AS subject,
       email_queue_plain     AS plain,
       email_queue_html      AS html
FROM email_queue
WHERE email_queue_sent IS NULL
ORDER BY email_queue_requested
LIMIT ${process.env.EMAIL_SEND_BATCH}
  `
  )

  for (const { id, sender, recipient, subject, plain, html } of emailsToSend) {
    try {
      await client.sendMessage({
        to: recipient,
        from: sender,
        plain,
        html,
        subject
      })

      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE email_queue
SET email_queue_sent = NOW()
WHERE email_queue_id = ${id}
`
      )
    } catch (e) {
      logger.error('Email sending failed', e)
      pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE email_queue
SET email_queue_last_error   = ${e.toString()},
    email_queue_last_attempt = NOW(),
    email_queue_attempt_count = email_queue_attempt_count + 1
WHERE email_queue_id = ${id}
        `
      )
    }
  }
}
