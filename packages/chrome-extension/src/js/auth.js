import browser from './browser'

const ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS = 30
const LEGACY_REFRESH_AREA_KEYS = ['token', 'tokenExpiresAt', 'googleIdToken']
const TOKEN_ENDPOINT = '/api/auth/extension/token'
const LOGIN_ENDPOINT = '/api/auth/login/extension'
const LOGOUT_ENDPOINT = '/api/auth/extension/logout'
const PENDING_LOGIN_KEY_PREFIX = 'pendingLogin:'
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000

const sessionAreaAvailable = () =>
  Boolean(browser.storage && browser.storage.session && typeof browser.storage.session.get === 'function')

const accessArea = () => (sessionAreaAvailable() ? browser.storage.session : browser.storage.local)
const refreshArea = () => browser.storage.local

export const base64UrlEncode = (bytes) => {
  let str = ''
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i])
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export const sha256Base64Url = async (input) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64UrlEncode(new Uint8Array(digest))
}

export const randomUrlSafe = (byteLength) => {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

// Pending logins live in storage.session because the MV3 service worker is
// terminated when idle. Google's OIDC dance routinely takes longer than the
// ~30-second worker lifetime, so an in-memory Map would be empty by the time
// the auth-callback message arrives at a respawned worker.
const pendingLoginArea = () =>
  browser.storage && browser.storage.session && typeof browser.storage.session.get === 'function'
    ? browser.storage.session
    : browser.storage.local

const pendingKey = (state) => `${PENDING_LOGIN_KEY_PREFIX}${state}`

const persistPendingLogin = async (state, payload) => {
  await pendingLoginArea().set({ [pendingKey(state)]: { ...payload, createdAt: Date.now() } })
}

const consumePendingLogin = async (state) => {
  const key = pendingKey(state)
  const stored = await pendingLoginArea().get([key])
  const entry = stored?.[key]
  if (!entry) return null
  await pendingLoginArea().remove([key])
  if (Date.now() - entry.createdAt > PENDING_LOGIN_TTL_MS) return null
  return entry
}

const sweepStalePendingLogins = async () => {
  if (typeof pendingLoginArea().get !== 'function') return
  try {
    const all = await pendingLoginArea().get(null)
    const stale = Object.entries(all || {})
      .filter(([key, value]) => key.startsWith(PENDING_LOGIN_KEY_PREFIX))
      .filter(([, value]) => !value?.createdAt || Date.now() - value.createdAt > PENDING_LOGIN_TTL_MS)
      .map(([key]) => key)
    if (stale.length > 0) await pendingLoginArea().remove(stale)
  } catch (_) {}
}

const exchangeCodeForTokens = async ({ appUrl, code, codeVerifier, extensionId, redirectUri }) => {
  const tokenResponse = await fetch(`${appUrl}${TOKEN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, extensionId, redirect_uri: redirectUri }),
  })
  if (!tokenResponse.ok) {
    const message = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} ${message}`)
  }
  return tokenResponse.json()
}

export const startExtensionLogin = async (appUrl) => {
  await sweepStalePendingLogins()
  const codeVerifier = randomUrlSafe(32)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomUrlSafe(16)
  const redirectUri = browser.runtime.getURL('auth-callback.html')
  const extensionId = browser.runtime.id

  await persistPendingLogin(state, { codeVerifier, redirectUri, appUrl, extensionId })

  const startUrl = new URL(`${appUrl}${LOGIN_ENDPOINT}`)
  startUrl.searchParams.set('extensionId', extensionId)
  startUrl.searchParams.set('code_challenge', codeChallenge)
  startUrl.searchParams.set('code_challenge_method', 'S256')
  startUrl.searchParams.set('state', state)
  startUrl.searchParams.set('redirect_uri', redirectUri)

  await browser.tabs.create({ url: startUrl.toString(), active: true })
}

export const completeLoginFromCallback = async ({ code, state, error }) => {
  const pending = await consumePendingLogin(state)
  if (!pending) {
    throw new Error(
      'No matching pending login for the auth callback (state expired or already used). Try signing in again.',
    )
  }
  if (error) throw new Error(`Sign-in failed: ${error}`)
  if (!code) throw new Error('Sign-in callback returned no code')
  return exchangeCodeForTokens({ ...pending, code })
}

export const refreshAccessToken = async (appUrl, refreshToken) => {
  const response = await fetch(`${appUrl}${TOKEN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Refresh failed: ${response.status} ${response.statusText} ${message}`)
  }
  return response.json()
}

export const persistTokens = async ({ access_token, refresh_token, expires_in }) => {
  const expiresAt = Date.now() + Math.max((expires_in - ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS) * 1000, 1000)
  await accessArea().set({ accessToken: access_token, accessTokenExpiresAt: expiresAt })
  await refreshArea().set({ refreshToken: refresh_token })
}

export const clearTokens = async () => {
  await accessArea().remove(['accessToken', 'accessTokenExpiresAt'])
  await refreshArea().remove(['refreshToken'])
}

export const purgeLegacyTokens = () => refreshArea().remove(LEGACY_REFRESH_AREA_KEYS).catch(() => {})

export const resolveAccessToken = async (appUrl) => {
  const { accessToken, accessTokenExpiresAt } = await accessArea().get(['accessToken', 'accessTokenExpiresAt'])
  if (accessToken && accessTokenExpiresAt && accessTokenExpiresAt > Date.now()) {
    return accessToken
  }
  const { refreshToken } = await refreshArea().get(['refreshToken'])
  if (!refreshToken) return null

  try {
    const tokens = await refreshAccessToken(appUrl, refreshToken)
    await persistTokens(tokens)
    return tokens.access_token
  } catch (e) {
    console.warn('Token refresh failed; clearing stored credentials', e)
    await clearTokens()
    return null
  }
}

export const sendLogout = async (appUrl) => {
  const { refreshToken } = await refreshArea().get(['refreshToken'])
  if (refreshToken) {
    try {
      await fetch(`${appUrl}${LOGOUT_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    } catch (e) {
      console.warn('Logout request failed; clearing local credentials anyway', e)
    }
  }
  await clearTokens()
}
