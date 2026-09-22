// Shared, email-client-safe branded layout + per-email content builders.
//
// Design (approved variant C + app button): light-minimal, table-based, fully
// inline-styled (survives clients that strip <style> blocks), ≤600px, Lato
// stack, brand magenta #b40089. The primary CTA matches the application button
// exactly: background #b40089, 1px solid #530059 border, 4px radius, white
// text. Mockups live under docs/email-redesign/mockups/.
//
// Builders return { subject, contentHtml, text, category }. `contentHtml` is a
// standalone fragment (it embeds its own hidden preheader span as the first
// element) that `sendNextEmailBatch` wraps in `renderLayout` at send time,
// where the per-recipient unsubscribe URL/headers are also computed.

const BRAND = '#b40089'
const BRAND_BORDER = '#530059'
const FONT_STACK = "'Lato',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// Hidden preview text shown by inboxes next to the subject.
const preheaderSpan = (text) =>
  `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(text)}</span>`

// Primary call-to-action button, styled to match the in-app button exactly.
const renderButton = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 8px 0;"><tr><td style="border-radius:4px;background:${BRAND};border:1px solid ${BRAND_BORDER};">` +
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>` +
  `</td></tr></table>`

// Category-specific footer note explaining why the recipient got the email.
const footerNoteForCategory = (category) => {
  switch (category) {
    case 'notification':
      return 'You subscribed to search notifications on Fomo Player.'
    case 'invite':
      return 'You are receiving this because your address is on the Fomo Player waiting list.'
    case 'verification':
      return 'You are receiving this because this address was entered on Fomo Player.'
    default:
      return 'You are receiving this from Fomo Player.'
  }
}

// Wrap a content fragment in the shared branded chrome. `unsubscribeUrl`, when
// provided, adds the footer unsubscribe affordance (suppressible categories
// only). `manageUrl`, when provided, adds a "Manage notifications" link.
const renderLayout = (contentHtml, { category, unsubscribeUrl, manageUrl } = {}) => {
  const footerLinks = []
  if (manageUrl) {
    footerLinks.push(
      `<a href="${escapeHtml(manageUrl)}" style="color:${BRAND};text-decoration:none;">Manage notifications</a>`,
    )
  }
  if (unsubscribeUrl) {
    footerLinks.push(
      `<a href="${escapeHtml(
        unsubscribeUrl,
      )}" style="color:#aaaaaa;text-decoration:underline;">Unsubscribe from all emails</a>`,
    )
  }
  const footerLinksHtml =
    footerLinks.length > 0
      ? `<p style="margin:0;font-size:12px;line-height:1.6;color:#aaaaaa;">${footerLinks.join(' &nbsp;·&nbsp; ')}</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Fomo Player</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT_STACK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:8px 12px 40px 12px;">
  <tr><td style="height:4px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding:8px 8px 36px 8px;">
        <span style="color:${BRAND};font-size:16px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Fomo Player</span>
      </td></tr>
      <tr><td style="padding:0 8px;">
${contentHtml}
      </td></tr>
      <tr><td style="padding:40px 8px 0 8px;">
        <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 18px 0;" />
        <p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:#aaaaaa;">${escapeHtml(
          footerNoteForCategory(category),
        )}</p>
        ${footerLinksHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

const heading = (text) =>
  `<h1 style="margin:0 0 10px 0;font-size:26px;line-height:1.25;color:#111111;font-weight:900;letter-spacing:-0.3px;">${text}</h1>`

const paragraph = (text) =>
  `<p style="margin:0 0 32px 0;font-size:16px;line-height:1.5;color:#666666;">${text}</p>`

// --- Content builders -----------------------------------------------------

const renderVerification = ({ verificationUrl }) => {
  const preview = 'Confirm your email to start receiving Fomo Player alerts.'
  const contentHtml = `${preheaderSpan(preview)}
        ${heading('Verify your email')}
        ${paragraph(
          'Confirm this address to start receiving new-music alerts and invites from Fomo Player.',
        )}
        ${renderButton(verificationUrl, 'Verify email')}
        <p style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#9a9a9a;">If the button does not work, open this link:<br/><a href="${escapeHtml(
          verificationUrl,
        )}" style="color:${BRAND};text-decoration:none;">${escapeHtml(verificationUrl)}</a></p>
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:#9a9a9a;">If you didn't request this, you can safely ignore this email.</p>`
  const text = `Verify your email

Confirm this address to start receiving new-music alerts and invites from Fomo Player by opening this link:
${verificationUrl}

If you didn't request this, you can safely ignore this email.`
  return { subject: 'Verify your Fomo Player email', contentHtml, text, category: 'verification' }
}

const renderInvite = ({ inviteUrl }) => {
  const preview = 'Your Fomo Player invite is ready.'
  const contentHtml = `${preheaderSpan(preview)}
        ${heading('You are invited to<br/>Fomo Player')}
        ${paragraph(
          'A spot opened up on your waiting-list entry. Sign up to start following labels and artists and get alerted the moment new tracks land.',
        )}
        ${renderButton(inviteUrl, 'Accept your invite')}
        <p style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#9a9a9a;">If the button does not work, open this link:<br/><a href="${escapeHtml(
          inviteUrl,
        )}" style="color:${BRAND};text-decoration:none;">${escapeHtml(inviteUrl)}</a></p>`
  const text = `You are invited to Fomo Player

A spot opened up on your waiting-list entry. Sign up here:
${inviteUrl}`
  return { subject: 'You have been invited to Fomo Player!', contentHtml, text, category: 'invite' }
}

const renderNotification = ({ searchText, tracks, searchUrl, fromStores }) => {
  const count = tracks.length
  const preview = `${count} new track${count === 1 ? '' : 's'} matched your search on Fomo Player.`
  const from = fromStores ? ` ${escapeHtml(fromStores)}` : ''
  const trackRows = tracks
    .map((track) => {
      // track may be a plain "Artists - Title (Version)" string, or an object.
      const line = typeof track === 'string' ? track : `${track.artists} - ${track.title}`
      return `<tr><td style="padding:0 0 18px 0;font-size:16px;color:#111111;font-weight:700;line-height:1.3;">${escapeHtml(
        line,
      )}</td></tr>`
    })
    .join('\n          ')
  const contentHtml = `${preheaderSpan(preview)}
        ${heading(`${count} new track${count === 1 ? '' : 's'} for<br/>&ldquo;${escapeHtml(searchText)}&rdquo;`)}
        ${paragraph(`Fresh matches from your saved search${from}.`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${trackRows}
        </table>
        ${renderButton(searchUrl, 'Listen now')}`
  const text = `${count} new track${count === 1 ? '' : 's'} for "${searchText}"

${tracks.map((t) => (typeof t === 'string' ? t : `${t.artists} - ${t.title}`)).join('\n')}

Listen now: ${searchUrl}`
  return {
    subject: `New results for your search '${searchText}'!`,
    contentHtml,
    text,
    category: 'notification',
  }
}

module.exports = {
  BRAND,
  BRAND_BORDER,
  renderLayout,
  renderButton,
  renderVerification,
  renderInvite,
  renderNotification,
  footerNoteForCategory,
  escapeHtml,
}
