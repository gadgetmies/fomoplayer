/**
 * App-level OAuth token manager for the Beatport v4 API.
 *
 * Beatport's catalog API (api.beatport.com/v4) requires a Bearer token, issued
 * by the identity service at account.beatport.com. The browser-challenged
 * storefront (www.beatport.com) is not involved. Flow:
 *   1. POST /identity/v1/login/        -> session cookie
 *   2. GET  /o/authorize/?...          -> redirect carrying an auth code
 *   3. POST /o/token/                  -> access_token (~10 min) + refresh_token
 * Subsequent renewals use the refresh_token grant; if that fails the full
 * login/authorize dance runs again. Access tokens are cached in memory.
 */
const { CookieJar, Cookie } = require('tough-cookie')

const IDENTITY_URL = 'https://account.beatport.com'
// Fixed Beatport OAuth identifiers (not deployment URLs): the public client of
// the API docs app and its registered post-message redirect.
const REDIRECT_URI = 'https://account.beatport.com/o/post-message/?origin=https://api.beatport.com'
const CLIENT_ID = process.env.BEATPORT_CLIENT_ID || '0GIvkCltVIuPkkwSJHp6NDb3s0potTjLBQr388Dd'
const EXPIRY_BUFFER_MS = 60 * 1000

let token = null // { accessToken, refreshToken, expiresAt }
let inflight = null

const credentials = () => {
  const username = process.env.BEATPORT_USERNAME
  const password = process.env.BEATPORT_PASSWORD
  if (!username || !password) {
    throw new Error('Beatport credentials missing: set BEATPORT_USERNAME and BEATPORT_PASSWORD')
  }
  return { username, password }
}

const storeCookiesFrom = async (jar, response) => {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const cookie = Cookie.parse(raw)
    if (cookie) await jar.setCookie(cookie, IDENTITY_URL)
  }
}

const cookieHeader = async (jar) => {
  const cookies = await jar.getCookieString(IDENTITY_URL)
  return cookies ? { Cookie: cookies } : {}
}

const exchange = async (params) => {
  const response = await fetch(`${IDENTITY_URL}/o/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  })
  if (!response.ok) {
    throw new Error(`Beatport token request failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  }
  const data = await response.json()
  token = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS,
  }
  return token
}

const loginAndAuthorize = async () => {
  const { username, password } = credentials()
  const jar = new CookieJar()

  const loginResponse = await fetch(`${IDENTITY_URL}/identity/v1/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!loginResponse.ok) {
    throw new Error(`Beatport login failed (${loginResponse.status}); check BEATPORT_USERNAME/BEATPORT_PASSWORD`)
  }
  await storeCookiesFrom(jar, loginResponse)

  const authorizeUrl =
    `${IDENTITY_URL}/o/authorize/?response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  const authorizeResponse = await fetch(authorizeUrl, { headers: await cookieHeader(jar), redirect: 'manual' })
  const location = authorizeResponse.headers.get('location')
  if (!location) {
    throw new Error(`Beatport authorize returned no redirect (status ${authorizeResponse.status})`)
  }
  const code = new URL(location, IDENTITY_URL).searchParams.get('code')
  if (!code) {
    throw new Error(`Beatport authorize redirect missing code: ${location}`)
  }

  return exchange({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
}

const renew = async () => {
  if (token?.refreshToken) {
    try {
      return await exchange({ grant_type: 'refresh_token', refresh_token: token.refreshToken })
    } catch {
      // refresh token expired or revoked — fall through to a full login
    }
  }
  return loginAndAuthorize()
}

const getAccessToken = async () => {
  if (process.env.BEATPORT_API_MOCK) return 'mock-access-token'
  if (token && Date.now() < token.expiresAt) return token.accessToken
  if (!inflight) {
    inflight = renew().finally(() => {
      inflight = null
    })
  }
  return (await inflight).accessToken
}

module.exports = {
  getAccessToken,
  _reset: () => {
    token = null
    inflight = null
  },
}
