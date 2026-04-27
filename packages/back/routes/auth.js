const crypto = require('crypto')
const express = require('express')
const passport = require('passport')
const defaultAccount = require('../db/account.js')
const defaultConfig = require('../config.js')
const { queryAccountCount: defaultQueryAccountCount, consumeHandoffJti: defaultConsumeHandoffJti } = require('./db')
const { deleteInviteCode: defaultDeleteInviteCode } = require('../db/account')
const { v4: uuid } = require('uuid')
const { createApiKey } = require('../db/api-key')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('../routes/shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const { isSafeRedirectPath, isSafeHandoffTarget } = require('./shared/safe-redirect')
const { mintHandoffToken: defaultMintHandoffToken, verifyHandoffToken: defaultVerifyHandoffToken } = require('./shared/auth-handoff-token')
const { evaluateSignUpPolicy } = require('./shared/auth-flow')
const logger = require('fomoplayer_shared').logger(__filename)

const createAuthRouter = ({
  account = defaultAccount,
  consumeHandoffJti = defaultConsumeHandoffJti,
  deleteInviteCode = defaultDeleteInviteCode,
  queryAccountCount = defaultQueryAccountCount,
  config = defaultConfig,
  mintHandoffTokenFn = defaultMintHandoffToken,
  verifyHandoffTokenFn = defaultVerifyHandoffToken,
} = {}) => {
  const router = express.Router()
  const {
    frontendURL,
    apiOrigin,
    allowedOrigins,
    allowedOriginRegexes,
    oidcHandoffUrl,
    oidcHandoffSecret,
    oidcHandoffAuthorityOrigin,
    isPreviewEnv,
    maxAccountCount,
  } = config

  const loginFailedUrl = `${frontendURL}/?loginFailed=true`
  const isSelfReferentialHandoffUrl = Boolean(
    oidcHandoffAuthorityOrigin && apiOrigin && oidcHandoffAuthorityOrigin === apiOrigin,
  )
  const delegatesToAuthority = Boolean(
    oidcHandoffUrl && oidcHandoffAuthorityOrigin && oidcHandoffSecret && !isSelfReferentialHandoffUrl,
  )
  const canMintHandoff = Boolean(oidcHandoffSecret && apiOrigin)
  if (isSelfReferentialHandoffUrl) {
    logger.info('OIDC_HANDOFF_URL points to this backend; acting as authority and ignoring delegation')
  }
  const redirectWithLoginFailed = (res) => res.redirect(loginFailedUrl)
  const safeFrontendRedirect = (res, returnPath) => {
    const safePath = isSafeRedirectPath(returnPath, frontendURL) ? returnPath : ''
    return res.redirect(`${frontendURL}${safePath}`)
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

  router.get('/login/google', (req, res, next) => {
    if (req.query.invite_code) {
      req.session.inviteCode = req.query.invite_code
    }
    const { returnPath } = req.query

    if (delegatesToAuthority) {
      const url = new URL(oidcHandoffUrl)
      if (returnPath) url.searchParams.set('returnPath', returnPath)
      url.searchParams.set('handoffTarget', apiOrigin)
      return res.redirect(url.toString())
    }

    const requestedHandoffTarget = req.query.handoffTarget
    const handoffTarget =
      requestedHandoffTarget && isSafeHandoffTarget(requestedHandoffTarget) ? requestedHandoffTarget : undefined
    if (requestedHandoffTarget && !handoffTarget) {
      logger.warn('Rejected unsafe handoffTarget at /login/google', { requestedHandoffTarget })
      return redirectWithLoginFailed(res)
    }

    return passport.authenticate('openidconnect', {
      state: { returnPath, handoffTarget },
    })(req, res, next)
  })

  router.get('/login/cli', (req, res, next) => {
    const callbackPort = parseInt(req.query.callbackPort, 10)
    if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
      return res.status(400).json({ error: 'callbackPort must be an integer between 1024 and 65535' })
    }
    return passport.authenticate('openidconnect', { state: { cliCallbackPort: callbackPort } })(req, res, next)
  })

  router.get('/login/google/return', (req, res, next) => {
    passport.authenticate('openidconnect', (err, user, info) => {
      if (err) {
        logger.error('OIDC authentication errored', {
          errorMessage: err?.message ?? String(err),
          errorName: err?.name,
          stack: err?.stack,
          info,
        })
        return redirectWithLoginFailed(res)
      }
      if (!user) {
        logger.warn('OIDC authentication produced no user', {
          failureInfo: info && typeof info === 'object' ? { ...info, reason: info.message } : info,
        })
        return redirectWithLoginFailed(res)
      }

      const { returnPath, handoffTarget, cliCallbackPort } = info?.state ?? {}

      if (cliCallbackPort) {
        const port = parseInt(cliCallbackPort, 10)
        if (!Number.isInteger(port) || port < 1024 || port > 65535) return redirectWithLoginFailed(res)
        if (!canMintHandoff) { logger.warn('CLI login: OIDC_HANDOFF_SECRET not configured'); return redirectWithLoginFailed(res) }
        const oidcIdentity = user?.oidcIdentity
        if (!oidcIdentity?.issuer || !oidcIdentity?.subject) {
          logger.error('CLI login: OIDC identity missing after auth'); return redirectWithLoginFailed(res)
        }
        let token
        try {
          ;({ token } = mintHandoffTokenFn({
            secret: oidcHandoffSecret, issuer: apiOrigin, audience: apiOrigin,
            oidcIssuer: oidcIdentity.issuer, oidcSubject: oidcIdentity.subject,
          }))
        } catch (e) { logger.error(`CLI login: minting handoff token failed: ${e}`); return redirectWithLoginFailed(res) }
        const callbackUrl = new URL(`http://localhost:${port}/`)
        callbackUrl.searchParams.set('token', token)
        return res.redirect(callbackUrl.toString())
      }

      const wantsHandoff = Boolean(handoffTarget)

      if (wantsHandoff) {
        if (!canMintHandoff || !isSafeHandoffTarget(handoffTarget)) {
          logger.warn('Handoff requested but cannot be fulfilled; falling back to login failure', {
            canMintHandoff,
            handoffTargetValid: isSafeHandoffTarget(handoffTarget),
          })
          return redirectWithLoginFailed(res)
        }

        const oidcIdentity = user?.oidcIdentity
        if (!oidcIdentity?.issuer || !oidcIdentity?.subject) {
          logger.error('OIDC identity missing on user after auth; cannot mint handoff token')
          return redirectWithLoginFailed(res)
        }

        const targetOrigin = new URL(handoffTarget).origin
        let token
        try {
          ;({ token } = mintHandoffTokenFn({
            secret: oidcHandoffSecret,
            issuer: apiOrigin,
            audience: targetOrigin,
            oidcIssuer: oidcIdentity.issuer,
            oidcSubject: oidcIdentity.subject,
          }))
        } catch (e) {
          logger.error(`Minting handoff token failed: ${e.toString()}`)
          return redirectWithLoginFailed(res)
        }

        const consumeUrl = new URL(`${targetOrigin}/api/auth/login/google/handoff`)
        consumeUrl.searchParams.set('token', token)
        if (returnPath) consumeUrl.searchParams.set('returnPath', returnPath)

        return res.redirect(consumeUrl.toString())
      }

      return req.login(user, (loginErr) => {
        if (loginErr) {
          logger.error('req.login failed after OIDC authentication', {
            errorMessage: loginErr?.message ?? String(loginErr),
            stack: loginErr?.stack,
          })
          return redirectWithLoginFailed(res)
        }
        return safeFrontendRedirect(res, returnPath)
      })
    })(req, res, next)
  })

  router.get('/login/google/handoff', async (req, res, next) => {
    try {
      if (!delegatesToAuthority) {
        logger.warn('Handoff consume called but this backend is not configured as a handoff consumer')
        return redirectWithLoginFailed(res)
      }

      const { token, returnPath } = req.query
      const payload = verifyHandoffTokenFn({
        token,
        secret: oidcHandoffSecret,
        issuer: oidcHandoffAuthorityOrigin,
        audience: apiOrigin,
      })
      if (!payload) {
        return redirectWithLoginFailed(res)
      }

      const expiresAt = new Date(payload.exp * 1000)
      const consumed = await consumeHandoffJti(payload.jti, expiresAt)
      if (!consumed) {
        logger.warn('Handoff token replay rejected', { jti: payload.jti })
        return redirectWithLoginFailed(res)
      }

      const user = await account.findOrCreateByIdentifier(payload.oidcIssuer, payload.sub)
      if (!user) {
        logger.error('Handoff user lookup/create failed')
        return redirectWithLoginFailed(res)
      }

      req.login(user, (err) => {
        if (err) return next(err)
        return safeFrontendRedirect(res, returnPath)
      })
    } catch (e) {
      next(e)
    }
  })

  router.post('/api-keys/exchange-handoff', async (req, res, next) => {
    try {
      const { token, name = 'fomoplayer CLI' } = req.body ?? {}
      if (!token) return res.status(400).json({ error: 'token is required' })
      if (!canMintHandoff) return res.status(503).json({ error: 'API key exchange not configured' })
      const payload = verifyHandoffTokenFn({ token, secret: oidcHandoffSecret, issuer: apiOrigin, audience: apiOrigin })
      if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
      const expiresAt = new Date(payload.exp * 1000)
      const consumed = await consumeHandoffJti(payload.jti, expiresAt)
      if (!consumed) { logger.warn('CLI exchange: token replay rejected', { jti: payload.jti }); return res.status(401).json({ error: 'Token already used' }) }
      const user = await account.findOrCreateByIdentifier(payload.oidcIssuer, payload.sub)
      if (!user) return res.status(500).json({ error: 'User lookup failed' })
      const rawKey = `fp_${uuid()}`
      const keyRecord = await createApiKey(user.id, rawKey, name)
      return res.json({ key: rawKey, id: keyRecord.api_key_id, name: keyRecord.api_key_name })
    } catch (e) { next(e) }
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
