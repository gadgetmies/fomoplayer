const router = require('express').Router()
const passport = require('passport')
const {
  apiOrigin,
  frontendURL,
  oidcHandoffAuthorityOrigin,
  oidcHandoffSecret,
  oidcHandoffUrl,
} = require('../config.js')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('../routes/shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const account = require('../db/account.js')
const { isSafeRedirectPath, isSafeHandoffTarget } = require('./shared/safe-redirect')
const { consumeHandoffJti } = require('./shared/auth-handoff-jti')
const { mintHandoffToken, verifyHandoffToken } = require('./shared/auth-handoff-token')
const logger = require('fomoplayer_shared').logger(__filename)

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

    const { returnPath, handoffTarget } = info?.state ?? {}
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
        ;({ token } = mintHandoffToken({
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
    const payload = verifyHandoffToken({
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

module.exports = router
