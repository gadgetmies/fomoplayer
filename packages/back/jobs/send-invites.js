const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { scheduleEmail } = require('../services/mailer')
const { queryAccountCount } = require('../routes/db')

const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../config.js')

const sendInviteEmail = async (email, inviteCode) => {
  const inviteUrl = `${config.frontendURL}/login/google/?invite_code=${inviteCode}`
  await scheduleEmail(
    process.env.INVITE_EMAIL_SENDER,
    email,
    'You have been invited to Fomo Player!',
    `You have been invited to Fomo Player! Sign up at ${inviteUrl}`,
    `<h1>You have been invited to Fomo Player!</h1><br/>
Sign up at <a href='${inviteUrl}'>${inviteUrl}</a>`,
  )
}

module.exports.sendInvites = async () => {
  const accountCount = await queryAccountCount()
  const availableSlots = accountCount < config.maxAccountCount ? config.maxAccountCount - accountCount : 0
  let combinedErrors = []
  
  const inviteEntries = await queryInviteEntries(availableSlots)
  for (const { email, inviteCode, waitingListId, inviteNumber } of inviteEntries) {
    try {
      await sendInviteEmail(email, inviteCode)
      await updateInviteSent(waitingListId, inviteNumber)
    } catch (e) {
      logger.error(`Failed to send invite #${inviteNumber} to ${email}: ${e.message}`)
      combinedErrors.push(e)
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

const queryInviteEntries = async (availableSlots) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryInviteEntries
SELECT 
  waiting_list_id AS "waitingListId",
  waiting_list_email AS "email", 
  waiting_list_invite_code AS "inviteCode",
  CASE
    WHEN waiting_list_first_invite_sent_at IS NULL AND ${availableSlots} > 0 THEN 1
    WHEN waiting_list_first_invite_sent_at IS NOT NULL 
          AND waiting_list_second_invite_sent_at IS NULL 
          AND waiting_list_first_invite_sent_at <= NOW() - INTERVAL '1 week' THEN 2
    WHEN waiting_list_second_invite_sent_at IS NOT NULL
          AND waiting_list_third_invite_sent_at IS NULL 
          AND waiting_list_first_invite_sent_at <= NOW() - INTERVAL '1 month' THEN 3
  END AS "inviteNumber"
FROM waiting_list
WHERE waiting_list_third_invite_sent_at IS NULL
ORDER BY waiting_list_created_at ASC
LIMIT ${availableSlots}
`,
  )

const updateInviteSent = async (waitingListId, inviteNumber) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateInviteSent
UPDATE waiting_list
SET 
  waiting_list_first_invite_sent_at = CASE WHEN ${inviteNumber} = 1 THEN NOW() ELSE waiting_list_first_invite_sent_at END,
  waiting_list_second_invite_sent_at = CASE WHEN ${inviteNumber} = 2 THEN NOW() ELSE waiting_list_second_invite_sent_at END,
  waiting_list_third_invite_sent_at = CASE WHEN ${inviteNumber} = 3 THEN NOW() ELSE waiting_list_third_invite_sent_at END
WHERE waiting_list_id = ${waitingListId}
`,
  )
