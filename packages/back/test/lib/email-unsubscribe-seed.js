// Shared seeding for the unsubscribe-page demo. Runs identically on local and
// preview: through the logged-in browser session (no DB access), so the same
// code seeds both environments.
//
// 1. Ensure the current account has an email address on file (idempotent —
//    POST /api/me/settings upserts). This is the address that will be
//    (un)subscribed by the demo.
// 2. Ask the backend for that account's one-click unsubscribe URL (a stateless
//    HMAC token minted server-side; no secret needed client-side).

const DEMO_EMAIL = 'demo-unsubscribe@fomoplayer.com'

const fetchViaBrowser = (page, path, { method = 'GET', body } = {}) =>
  page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      let json = null
      const text = await r.text()
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return { status: r.status, text, json }
    },
    { path, method, body },
  )

// Returns the unsubscribe token for the session account. The demo navigates to
// the unsubscribe page on the current origin (works on local + preview), so we
// only need the token — not the emailed absolute URL.
const seedUnsubscribeTokenViaApi = async (page) => {
  const set = await fetchViaBrowser(page, '/api/me/settings', { method: 'POST', body: { email: DEMO_EMAIL } })
  if (set.status < 200 || set.status >= 300) {
    throw new Error(`POST /api/me/settings failed: HTTP ${set.status} — ${set.text}`)
  }

  const res = await fetchViaBrowser(page, '/api/me/email/unsubscribe-url')
  if (res.status < 200 || res.status >= 300 || !res.json || !res.json.url) {
    throw new Error(`GET /api/me/email/unsubscribe-url failed: HTTP ${res.status} — ${res.text}`)
  }
  const token = new URL(res.json.url).searchParams.get('token')
  if (!token) {
    throw new Error(`No token in unsubscribe URL: ${res.json.url}`)
  }
  return token
}

module.exports = { seedUnsubscribeTokenViaApi, DEMO_EMAIL }
