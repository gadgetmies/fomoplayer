// Unauthenticated, no-login email unsubscribe endpoints. Mounted before the
// authenticated `/api` router so the RFC 8058 one-click POST needs no session
// or CSRF token.
//
//   POST /api/email/unsubscribe   one-click machine target → 200 empty body
//   GET  /api/email/unsubscribe   branded human confirm page (does not mutate)
//   POST /api/email/resubscribe   remove suppression for a valid token
//
// The GET page's confirm button POSTs to the one-click endpoint (so link
// prefetchers / scanners cannot silently opt users out with a bare GET) and
// then offers resubscribe.

const bodyParser = require('body-parser')
const expressPromiseRouter = require('express-promise-router')
const logger = require('fomoplayer_shared').logger(__filename)
const {
  validateToken: defaultValidateToken,
  suppress: defaultSuppress,
  unsuppress: defaultUnsuppress,
} = require('../../services/email-unsubscribe')

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

const pageShell = (bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Fomo Player — Email preferences</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT_STACK};color:#111111;">
<div style="height:4px;background:${BRAND};"></div>
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="color:${BRAND};font-size:16px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:36px;">Fomo Player</div>
  ${bodyHtml}
</div>
</body>
</html>`

const button = (label, onclick) =>
  `<button type="button" onclick="${onclick}" style="cursor:pointer;border-radius:4px;background:${BRAND};border:1px solid ${BRAND_BORDER};padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;">${escapeHtml(
    label,
  )}</button>`

// `basePath` is this router's mount path (e.g. "/api/email"); the confirm page
// POSTs to origin-relative paths under it, so it works unchanged in every
// environment (production, preview, and the CI demo backend) without depending
// on a configured absolute API host.
const confirmPage = (address, token, basePath) => {
  const tokenJson = JSON.stringify(token)
  const base = JSON.stringify(basePath)
  const addr = escapeHtml(address)
  const script = `
    async function post(path){
      const res = await fetch(${base}+path, {
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded'},
        body:'List-Unsubscribe=One-Click&token='+encodeURIComponent(${tokenJson})
      });
      return res.ok;
    }
    async function doUnsub(){
      document.getElementById('unsub-btn').disabled=true;
      const ok=await post('/unsubscribe');
      document.getElementById('view').innerHTML = ok
        ? '<h1 style="font-size:26px;font-weight:900;margin:0 0 12px;">You are unsubscribed</h1>'
          +'<p style="font-size:16px;color:#666;line-height:1.5;margin:0 0 24px;">${addr} will no longer receive Fomo Player emails. Changed your mind?</p>'
          +'<button type="button" onclick="doResub()" style="cursor:pointer;border-radius:4px;background:${BRAND};border:1px solid ${BRAND_BORDER};padding:12px 26px;font-size:15px;font-weight:700;color:#fff;">Resubscribe</button>'
        : '<p style="font-size:16px;color:#666;">Something went wrong. Please try again.</p>';
    }
    async function doResub(){
      const ok=await post('/resubscribe');
      document.getElementById('view').innerHTML = ok
        ? '<h1 style="font-size:26px;font-weight:900;margin:0 0 12px;">You are resubscribed</h1>'
          +'<p style="font-size:16px;color:#666;line-height:1.5;margin:0;">${addr} will receive Fomo Player emails again.</p>'
        : '<p style="font-size:16px;color:#666;">Something went wrong. Please try again.</p>';
    }
  `
  const body = `<div id="view">
    <h1 style="font-size:26px;font-weight:900;margin:0 0 12px;">Unsubscribe from all emails?</h1>
    <p style="font-size:16px;color:#666;line-height:1.5;margin:0 0 24px;">This will stop all Fomo Player notification and invite emails to <strong>${addr}</strong>.</p>
    <button id="unsub-btn" type="button" onclick="doUnsub()" style="cursor:pointer;border-radius:4px;background:${BRAND};border:1px solid ${BRAND_BORDER};padding:12px 26px;font-size:15px;font-weight:700;color:#fff;">Unsubscribe</button>
  </div>
  <script>${script}</script>`
  return pageShell(body)
}

const invalidPage = () =>
  pageShell(
    `<h1 style="font-size:26px;font-weight:900;margin:0 0 12px;">Link expired or invalid</h1>
     <p style="font-size:16px;color:#666;line-height:1.5;margin:0;">This unsubscribe link is no longer valid. If you keep receiving unwanted email, contact support.</p>`,
  )

const createEmailRouter = ({
  validateToken = defaultValidateToken,
  suppress = defaultSuppress,
  unsuppress = defaultUnsuppress,
} = {}) => {
  const router = expressPromiseRouter()
  router.use(bodyParser.urlencoded({ extended: false }))
  router.use(bodyParser.json())

  const tokenFrom = (req) => req.query.token || (req.body && req.body.token)

  // One-click machine target: 200 with an empty body on success.
  router.post('/unsubscribe', async (req, res) => {
    const address = validateToken(tokenFrom(req))
    if (!address) {
      return res.status(400).send()
    }
    await suppress(address, 'one-click')
    logger.info('Email address unsubscribed', { source: 'one-click' })
    return res.status(200).send()
  })

  // Human confirmation page — never mutates on GET.
  router.get('/unsubscribe', async (req, res) => {
    const token = req.query.token
    const address = validateToken(token)
    if (!address) {
      return res.status(400).send(invalidPage())
    }
    return res.status(200).send(confirmPage(address, token, req.baseUrl))
  })

  router.post('/resubscribe', async (req, res) => {
    const address = validateToken(tokenFrom(req))
    if (!address) {
      return res.status(400).send()
    }
    await unsuppress(address)
    logger.info('Email address resubscribed')
    return res.status(200).send()
  })

  return router
}

const router = createEmailRouter()
module.exports = router
module.exports.createEmailRouter = createEmailRouter
