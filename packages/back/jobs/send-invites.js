const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { scheduleEmail } = require('../services/mailer')
const { queryAccountCount } = require('../routes/db')

const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../config.js')

module.exports.sendInvites = async () => {
  const accountCount = await queryAccountCount()
  let combinedErrors = []
  if (accountCount < config.maxAccountCount) {
    const waitingListEntries = await queryNextWaitingEntries(config.maxAccountCount - accountCount)
    for (const { email, inviteCode } of waitingListEntries) {
      try {
        const inviteUrl = `${config.frontendURL}/login/google/?invite_code=${inviteCode}`
        await scheduleEmail(
          process.env.INVITE_EMAIL_SENDER,
          email,
          'You have been invited to Fomo Player!',
          `You have been invited to Fomo Player! Sign up at ${inviteUrl}`,
          `<h1>You have been invited to Fomo Player!</h1><br/>
Sign up at <a href='${inviteUrl}'>${inviteUrl}</a>`,
        )
      } catch (e) {
        logger.error(`Failed to send invite to ${email}: ${e.message}`)
        combinedErrors.push(e)
      }
    }
  }

  if (combinedErrors.length !== 0) {
    await scheduleEmail(
      process.env.ADMIN_EMAIL_SENDER,
      process.env.ADMIN_EMAIL_RECIPIENT,
      'URGENT! Invite sending failed!',
      `Errors: ${JSON.stringify(combinedErrors)}`,
    )
    return { result: combinedErrors, success: false }
  }
  return { success: true }
}

const queryNextWaitingEntries = async (count) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getNotificationDetails
SELECT waiting_list_email AS "email", waiting_list_invite_code AS "inviteCode"
FROM
  waiting_list
ORDER BY waiting_list_created_at DESC
LIMIT ${count}
`,
  )
