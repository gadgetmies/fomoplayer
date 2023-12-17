const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { MessageClient } = require('cloudmailin')
const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../config')

let options = {
  username: process.env.CLOUDMAILIN_USERNAME,
  apiKey: process.env.CLOUDMAILIN_API_KEY
}

if (process.env.NODE_ENV !== 'production') {
  options.baseURL = `${config.apiURL}/mock/email`
}

const client = new MessageClient(options)

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
  const emailsToSend = await pg.queryRowsAsync(
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

  const errors = []

  for (const { id, sender, recipient, subject, plain, html } of emailsToSend) {
    try {
      await client.sendMessage({
        to: recipient,
        from: `"Fomo Player"<${sender}>`,
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
      errors.push(e.toString())
    }
  }

  if (errors.length === 0) {
    return { success: true }
  } else {
    return { success: false, result: errors }
  }
}
