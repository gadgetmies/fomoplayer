const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { Resend } = require('resend')
const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../config')
const { renderLayout } = require('./email-templates')
const { listUnsubscribeHeaders, unsubscribeUrl, isSuppressed } = require('./email-unsubscribe')

// User-facing categories get the branded layout; suppressible categories also
// get the unsubscribe footer/link + List-Unsubscribe headers and are skipped
// for opted-out recipients. `admin` and legacy null-category rows are sent as
// plain, unbranded content exactly as before.
const BRANDED_CATEGORIES = new Set(['verification', 'invite', 'notification'])
const SUPPRESSIBLE_CATEGORIES = new Set(['notification', 'invite'])

// Lazily created so the module can be required in any environment; the client
// is only needed when actually sending via Resend (production).
let resendClient = null
const getResendClient = () => {
  if (!config.resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured; cannot send mail')
  }
  if (!resendClient) {
    resendClient = new Resend(config.resendApiKey)
  }
  return resendClient
}

// Send one message. In production this hits Resend; otherwise it posts the
// rendered payload to the existing mock endpoint (preserving dev/test/browser
// behaviour). Returns Resend's `{ data, error }` shape either way.
const sendViaTransport = async ({ from, to, subject, html, text, headers, idempotencyKey }) => {
  if (config.isProduction) {
    return getResendClient().emails.send({ from, to, subject, html, text, headers }, { idempotencyKey })
  }

  const response = await fetch(`${config.apiURL}/mock/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text, headers, idempotencyKey }),
  })
  if (!response.ok) {
    return { data: null, error: { message: `mock email endpoint returned ${response.status}` } }
  }
  return { data: { id: `mock-${idempotencyKey}` }, error: null }
}

module.exports.scheduleEmail = async (sender, recipient, subject, plain, html = plain, category = null) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO email_queue (email_queue_sender, email_queue_recipient, email_queue_subject, email_queue_plain,
                         email_queue_html, email_queue_category)
VALUES (${sender}, ${recipient}, ${subject}, ${plain}, ${html}, ${category})
`,
  )
}

// `transport` is injectable for tests; production/dev use `sendViaTransport`.
module.exports.sendNextEmailBatch = async ({ transport = sendViaTransport } = {}) => {
  const emailsToSend = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- sendNextBatch
SELECT email_queue_id        AS id,
       email_queue_sender    AS sender,
       email_queue_recipient AS recipient,
       email_queue_subject   AS subject,
       email_queue_plain     AS plain,
       email_queue_html      AS html,
       email_queue_category  AS category
FROM email_queue
WHERE email_queue_sent IS NULL
  AND email_queue_skipped_reason IS NULL
ORDER BY email_queue_requested
LIMIT ${process.env.EMAIL_SEND_BATCH}
  `,
  )

  const errors = []

  for (const { id, sender, recipient, subject, plain, html, category } of emailsToSend) {
    try {
      // Send-time suppression: skip opted-out recipients for suppressible
      // categories and mark the row so it is not retried. Verification is
      // exempt (user-initiated, transactional) and always sends.
      if (SUPPRESSIBLE_CATEGORIES.has(category) && (await isSuppressed(recipient))) {
        await pg.queryAsync(
          // language=PostgreSQL
          sql`UPDATE email_queue SET email_queue_skipped_reason = 'suppressed' WHERE email_queue_id = ${id}`,
        )
        continue
      }

      const suppressible = SUPPRESSIBLE_CATEGORIES.has(category)

      let finalHtml = html
      let finalText = plain
      let headers = {}

      if (BRANDED_CATEGORIES.has(category)) {
        const manageUrl = category === 'notification' ? `${config.frontendURL}/settings/notifications` : undefined
        finalHtml = renderLayout(html, {
          category,
          unsubscribeUrl: suppressible ? unsubscribeUrl(recipient) : undefined,
          manageUrl,
        })
      }

      if (suppressible) {
        headers = listUnsubscribeHeaders(recipient)
        finalText = `${plain}\n\nUnsubscribe from all Fomo Player emails: ${unsubscribeUrl(recipient)}`
      }

      const { data, error } = await transport({
        from: `Fomo Player <${sender}>`,
        to: recipient,
        subject,
        html: finalHtml,
        text: finalText,
        headers,
        idempotencyKey: String(id),
      })

      // Resend returns { data, error } and does not throw for API errors; a
      // non-null error is a failed attempt, not a success.
      if (error) {
        throw new Error(typeof error === 'string' ? error : error.message || JSON.stringify(error))
      }

      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE email_queue
SET email_queue_sent                = NOW(),
    email_queue_provider_message_id = ${data?.id ?? null}
WHERE email_queue_id = ${id}
`,
      )
    } catch (e) {
      logger.error('Email sending failed', e)
      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE email_queue
SET email_queue_last_error    = ${e.toString()},
    email_queue_last_attempt  = NOW(),
    email_queue_attempt_count = email_queue_attempt_count + 1
WHERE email_queue_id = ${id}
        `,
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
