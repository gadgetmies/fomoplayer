const crypto = require('crypto')
const express = require('express')
const passport = require('passport')
const defaultAccount = require('../db/account.js')
const defaultTokenServer = require('../token-server')
const defaultConfig = require('../config.js')
const { queryAccountCount: defaultQueryAccountCount, consumeHandoffJti: defaultConsumeHandoffJti } = require('./db')
const { deleteInviteCode: defaultDeleteInviteCode } = require('../db/account')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('../routes/shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const {
  parseReturnUrl,
  isAllowedReturnUrl,
  evaluateSignUpPolicy,
  isGoogleSubAllowed,
  getRequestOrigin,
} = require('./shared/auth-flow')
const logger = require('fomoplayer_shared').logger(__filename)

const isSafeRedirectPath = (url, baseURL) => {
  if (!url) return false
  if (url.startsWith('//') || url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).origin === new URL(baseURL).origin
    } catch {
      return false
    }
  }
  if (url.includes('\\')) return false
  return url.startsWith('/')
}

const handoffTtlSeconds = 120

const createAuthRouter = ({
  account = defaultAccount,
  tokenServer = defaultTokenServer,
  config = defaultConfig,
  queryAccountCount = defaultQueryAccountCount,
  consumeHandoffJti = defaultConsumeHandoffJti,
  deleteInviteCode = defaultDeleteInviteCode,
} = {}) => {
  const router = express.Router()
  const {
    frontendURL,
    apiURL,
    allowedOrigins,
    allowedOriginRegexes,
    internalAuthHandoffPrivateKey,
    internalAuthHandoffJwksUrl,
    internalAuthHandoffKid,
    internalAuthHandoffIssuer,
    internalAuthApiAudience,
    isPreviewEnv,
    previewAllowedGoogleSubs,
    googleClientId,
    googleOidcApiRedirect,
  } = config
  const { issueInternalToken, verifyInternalToken, verifyGoogleIdToken, getInternalPublicJwk } = tokenServer
  const canIssueInternalToken = Boolean(internalAuthHandoffIssuer && internalAuthHandoffPrivateKey)
  const canVerifyInternalToken = Boolean(internalAuthHandoffIssuer && internalAuthHandoffJwksUrl)

  const isAllowedReturnUrlForConfig = (returnUrl) =>
    isAllowedReturnUrl(returnUrl, allowedOrigins, allowedOriginRegexes)

  const loginFailedRedirectUrl = (() => {
    const parsedFrontendUrl = parseReturnUrl(frontendURL)
    if (!parsedFrontendUrl) {
      return '/?loginFailed=true'
    }

    return new URL('/?loginFailed=true', parsedFrontendUrl.origin).toString()
  })()

  const delegatedGoogleLoginBaseUrl = (() => {
    const parsedApiUrl = parseReturnUrl(apiURL)
    const parsedGoogleCallback = parseReturnUrl(googleOidcApiRedirect)
    if (!parsedApiUrl || !parsedGoogleCallback) {
      return undefined
    }

    if (parsedApiUrl.origin === parsedGoogleCallback.origin) {
      return undefined
    }

    const delegatedPath = parsedGoogleCallback.pathname.replace(
      /\/auth\/login\/google\/return$/,
      '/auth/login/google',
    )
    return new URL(delegatedPath, parsedGoogleCallback.origin)
  })()

  const isValidHandoffPayload = (payload, expectedAudience) => {
    const now = Math.floor(Date.now() / 1000)
    const aud = Array.isArray(payload?.aud) ? payload.aud[0] : payload?.aud
    if (
      !payload ||
      payload.iss !== internalAuthHandoffIssuer ||
      aud !== expectedAudience ||
      !payload.sub ||
      !payload.sid ||
      !payload.nonce ||
      !payload.oidc_iss ||
      !payload.jti ||
      payload.token_type !== 'preview_handoff'
    ) {
      return false
    }

    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      return false
    }

    return payload.exp >= now && payload.iat <= now + 30
  }

  const logout = (req, res, next) => {
    req.logout((err) => {
      if (err) {
        next('Logout failed. Please contact an admin.')
      } else {
        res.status(204).send()
      }
    })
  }

  router.post('/logout', logout)
  router.get('/logout', logout)

  router.get('/.well-known/jwks.json', async (_, res) => {
    if (!config.internalAuthHandoffPublicKey) {
      return res.status(404).json({ error: 'JWKS is not configured' })
    }
    try {
      const jwk = await getInternalPublicJwk({
        publicKey: config.internalAuthHandoffPublicKey,
        keyId: internalAuthHandoffKid,
      })
      if (!jwk) {
        return res.status(404).json({ error: 'JWKS is not configured' })
      }
      return res.json({ keys: [jwk] })
    } catch (e) {
      logger.error(`Failed to load internal auth JWKS: ${e.toString()}`)
      return res.status(500).json({ error: 'Failed to load JWKS' })
    }
  })

  router.get('/login/google', (req, res, next) => {
    const returnUrl = req.query.return_url
    const inviteCode = req.query.invite_code
    const delegatedPreviewSessionId = req.query.preview_session_id
    const delegatedPreviewNonce = req.query.preview_nonce
    if (!isAllowedReturnUrlForConfig(returnUrl)) {
      return res.status(400).json({ error: 'Invalid return_url' })
    }
    const parsedReturnUrl = parseReturnUrl(returnUrl)
    if (!parsedReturnUrl) {
      return res.status(400).json({ error: 'Invalid return_url' })
    }

    const previewSessionId = delegatedPreviewSessionId || req.sessionID
    const previewNonce = delegatedPreviewNonce || crypto.randomUUID()
    req.session.oidcHandoff = {
      nonce: previewNonce,
      returnUrl,
      sessionId: previewSessionId,
      returnOrigin: parsedReturnUrl.origin,
    }
    req.session.inviteCode = inviteCode

    const currentRequestOrigin = parseReturnUrl(getRequestOrigin(req))
    const shouldDelegateLogin =
      delegatedGoogleLoginBaseUrl &&
      (!currentRequestOrigin || currentRequestOrigin.host !== delegatedGoogleLoginBaseUrl.host)
    if (shouldDelegateLogin) {
      const delegatedLoginUrl = new URL(delegatedGoogleLoginBaseUrl.toString())
      delegatedLoginUrl.searchParams.set('return_url', returnUrl)
      delegatedLoginUrl.searchParams.set('preview_session_id', previewSessionId)
      delegatedLoginUrl.searchParams.set('preview_nonce', previewNonce)
      if (inviteCode) {
        delegatedLoginUrl.searchParams.set('invite_code', inviteCode)
      }
      return res.redirect(delegatedLoginUrl.toString())
    }

    return passport.authenticate('openidconnect', {
      state: { return_url: returnUrl, preview_session_id: previewSessionId, preview_nonce: previewNonce },
    })(req, res, next)
  })

  router.post('/handoff/exchange', async (req, res) => {
    if (!canVerifyInternalToken) {
      return res.status(500).json({ error: 'OIDC handoff is not configured' })
    }

    const token = req.body?.code
    if (!token) {
      return res.status(400).json({ error: 'Missing handoff code' })
    }

    try {
      const sessionHandoff = req.session.oidcHandoff
      const expectedAudience = sessionHandoff?.returnOrigin
      if (!expectedAudience) {
        return res.status(401).json({ error: 'Invalid handoff session' })
      }
      const payload = await verifyInternalToken({
        token,
        jwksUrl: internalAuthHandoffJwksUrl,
        issuer: internalAuthHandoffIssuer,
        audience: expectedAudience,
      })
      if (!isValidHandoffPayload(payload, expectedAudience)) {
        return res.status(401).json({ error: 'Invalid handoff payload' })
      }
      if (!isGoogleSubAllowed({ isPreviewEnv, previewAllowedGoogleSubs, googleSub: payload.sub })) {
        return res.status(403).json({ error: 'preview_access_denied' })
      }

      if (!sessionHandoff || payload.sid !== req.sessionID || payload.nonce !== sessionHandoff.nonce) {
        return res.status(401).json({ error: 'Invalid handoff session' })
      }

      const jtiExpiresAt = new Date(payload.exp * 1000)
      const jtiConsumed = await consumeHandoffJti(payload.jti, jtiExpiresAt)
      if (!jtiConsumed) {
        return res.status(401).json({ error: 'Handoff code has already been used' })
      }

      let user = await account.findByIdentifier(payload.oidc_iss, payload.sub)
      if (!user) {
        const signUpPolicy = await evaluateSignUpPolicy({
          inviteCode: req.session?.inviteCode,
          queryAccountCount,
          maxAccountCount: config.maxAccountCount,
          deleteInviteCode,
        })
        if (!signUpPolicy.allowed) {
          if (signUpPolicy.error === 'sign_up_not_available') {
            return res.status(403).json({ error: 'Sign up is not available' })
          }
          if (signUpPolicy.error === 'invalid_invite_code') {
            return res.status(401).json({ error: 'Invalid invite code' })
          }
        }

        user = await account.findOrCreateByIdentifier(payload.oidc_iss, payload.sub)
      }

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error('Preview handoff session regeneration failed', regenerateErr)
          return res.status(500).json({ error: 'Preview login failed' })
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            logger.error('Preview handoff login failed', loginErr)
            return res.status(500).json({ error: 'Preview login failed' })
          }
          return res.status(204).end()
        })
      })
    } catch (e) {
      logger.error(`Handoff exchange failed: ${e.toString()}`)
      return res.status(401).json({ error: 'Invalid handoff code' })
    }
  })

  router.post('/token/exchange-google', async (req, res) => {
    if (!canIssueInternalToken) {
      return res.status(500).json({ error: 'Internal token issuing is not configured' })
    }

    const id_token = req.body?.id_token
    if (!id_token) {
      return res.status(400).json({ error: 'Missing Google id_token' })
    }

    try {
      const googlePayload = await verifyGoogleIdToken({ id_token, googleClientId })
      if (!isGoogleSubAllowed({ isPreviewEnv, previewAllowedGoogleSubs, googleSub: googlePayload.sub })) {
        return res.status(403).json({ error: 'preview_access_denied' })
      }
      const user = await account.findOrCreateByIdentifier(googlePayload.iss, googlePayload.sub)
      const expiresIn = 60 * 15
      const accessToken = await issueInternalToken({
        privateKey: internalAuthHandoffPrivateKey,
        keyId: internalAuthHandoffKid,
        issuer: internalAuthHandoffIssuer,
        audience: internalAuthApiAudience,
        subject: googlePayload.sub,
        expiresInSeconds: expiresIn,
        payload: {
          oidc_iss: googlePayload.iss,
          token_type: 'api_access',
          jti: crypto.randomUUID(),
          user_id: user.id,
        },
      })
      return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn })
    } catch (e) {
      logger.error(`Google token exchange failed: ${e.toString()}`)
      return res.status(401).json({ error: 'Invalid Google id_token' })
    }
  })

  router.get('/login/google/return', (req, res, next) => {
    passport.authenticate('openidconnect', (err, user, info) => {
      const stateReturnUrl = info?.state?.return_url || req.session?.oidcHandoff?.returnUrl
      const previewSessionId = info?.state?.preview_session_id || req.session?.oidcHandoff?.sessionId
      const previewNonce = info?.state?.preview_nonce || req.session?.oidcHandoff?.nonce

      if (err || !user) {
        if (isAllowedReturnUrlForConfig(stateReturnUrl)) {
          const failedUrl = new URL(stateReturnUrl)
          failedUrl.searchParams.set('loginFailed', 'true')
          return res.redirect(failedUrl.toString())
        }
        return res.redirect(loginFailedRedirectUrl)
      }
      const isHandoffState = Boolean(previewSessionId && previewNonce)
      if (
        !isHandoffState ||
        !canIssueInternalToken ||
        !isAllowedReturnUrlForConfig(stateReturnUrl)
      ) {
        return res.redirect(loginFailedRedirectUrl)
      }

      const returnUrl = parseReturnUrl(stateReturnUrl)
      if (!returnUrl) {
        return res.redirect(loginFailedRedirectUrl)
      }
      return issueInternalToken({
        privateKey: internalAuthHandoffPrivateKey,
        keyId: internalAuthHandoffKid,
        issuer: internalAuthHandoffIssuer,
        audience: returnUrl.origin,
        subject: user.oidcSubject,
        expiresInSeconds: handoffTtlSeconds,
        payload: {
          oidc_iss: user.oidcIssuer,
          sid: previewSessionId,
          nonce: previewNonce,
          token_type: 'preview_handoff',
          jti: crypto.randomUUID(),
        },
      })
        .then((handoffCode) => {
          const consumeUrl = new URL('/auth/consume', returnUrl.origin)
          consumeUrl.searchParams.set('code', handoffCode)
          consumeUrl.searchParams.set('return_url', stateReturnUrl)
          return res.redirect(consumeUrl.toString())
        })
        .catch((tokenError) => {
          logger.error(`Failed to issue handoff token: ${tokenError.toString()}`)
          return res.redirect(loginFailedRedirectUrl)
        })
    })(req, res, next)
  })

  router.get('/spotify', async ({ user: { id: userId }, query }, res) => {
    const authorizationUrl = getAuthorizationUrl(query.path, query.write === 'true')
    res.redirect(authorizationUrl)
  })

  router.get('/spotify/callback', async ({ user: { id: userId }, query: { code, state } }, res) => {
    const [path] = Array.from(new URLSearchParams(decodeURIComponent(state)).values())
    try {
      const result = await requestTokens(code)
      const { expires_in, access_token, refresh_token, scope } = result.body
      await upsertUserAuthorizationTokens(
        userId,
        spotifyStoreName,
        access_token,
        refresh_token,
        expires_in,
        scope.split(' '),
      )
    } catch (e) {
      logger.error(`Spotify callback handling failed: ${e.toString()}`)
    }
    const safePath = isSafeRedirectPath(path, frontendURL) ? path : ''
    res.redirect(`${frontendURL}${safePath}`)
  })

  if (process.env.NODE_ENV !== 'production') {
    router.post(
      '/login',
      (req, res, next) => {
        next()
      },
      passport.authenticate(['local']),
      (req, res) => res.status(204).end(),
    )
  }

  return router
}

const router = createAuthRouter()
module.exports = router
module.exports.createAuthRouter = createAuthRouter
