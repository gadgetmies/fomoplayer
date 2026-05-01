const crypto = require('crypto')
const express = require('express')
const passport = require('passport')
const fs = require('fs')
const path = require('path')
const defaultAccount = require('../db/account.js')
const defaultConfig = require('../config.js')
const { queryAccountCount: defaultQueryAccountCount, consumeHandoffJti: defaultConsumeHandoffJti } = require('./db')
const { deleteInviteCode: defaultDeleteInviteCode } = require('../db/account')
const { v4: uuid } = require('uuid')
const { createApiKey } = require('../db/api-key')
const defaultExtensionRefreshToken = require('../db/extension-refresh-token')
const defaultTokenServer = require('../token-server')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('../routes/shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const { isSafeRedirectPath, isSafeHandoffTarget } = require('./shared/safe-redirect')
const { mintHandoffToken: defaultMintHandoffToken, verifyHandoffToken: defaultVerifyHandoffToken } = require('./shared/auth-handoff-token')
const { issueCode: defaultIssueCode, consumeCode: defaultConsumeCode } = require('./shared/cli-auth-code')
const { verifyActionsToken: defaultVerifyActionsToken, GITHUB_ACTIONS_ISSUER } = require('./shared/github-actions-oidc')
const { evaluateSignUpPolicy, getRequestOrigin, isGoogleSubAllowed } = require('./shared/auth-flow')

const GOOGLE_OIDC_ISSUER = 'accounts.google.com'
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const logger = require('fomoplayer_shared').logger(__filename)
const cliTemplateDir = path.resolve(__dirname, '../public/auth/cli')
const cliTemplates = {
  login: fs.readFileSync(path.join(cliTemplateDir, 'login.html'), 'utf8'),
  grant: fs.readFileSync(path.join(cliTemplateDir, 'grant.html'), 'utf8'),
  failed: fs.readFileSync(path.join(cliTemplateDir, 'failed.html'), 'utf8'),
  denied: fs.readFileSync(path.join(cliTemplateDir, 'denied.html'), 'utf8'),
}
const renderCliTemplate = (templateName, replacements = {}) => {
  const template = cliTemplates[templateName]
  return Object.entries(replacements).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}

const createAuthRouter = ({
  account = defaultAccount,
  consumeHandoffJti = defaultConsumeHandoffJti,
  deleteInviteCode = defaultDeleteInviteCode,
  queryAccountCount = defaultQueryAccountCount,
  config = defaultConfig,
  mintHandoffTokenFn = defaultMintHandoffToken,
  verifyHandoffTokenFn = defaultVerifyHandoffToken,
  issueCodeFn = defaultIssueCode,
  consumeCodeFn = defaultConsumeCode,
  verifyActionsTokenFn = defaultVerifyActionsToken,
  extensionRefreshToken = defaultExtensionRefreshToken,
  tokenServer = defaultTokenServer,
} = {}) => {
  const router = express.Router()
  const {
    frontendURL,
    authApiURL,
    apiOrigin,
    allowedOrigins,
    allowedOriginRegexes,
    oidcHandoffUrl,
    oidcHandoffSecret,
    oidcHandoffAuthorityOrigin,
    isPreviewEnv,
    previewAllowedGoogleSubs,
    maxAccountCount,
    githubActionsOidcRepo,
    extensionOauthAllowedIds,
    internalAuthHandoffPrivateKey,
    internalAuthHandoffPublicKey,
    internalAuthHandoffKeyId,
    internalAuthHandoffIssuer,
    internalAuthApiAudience,
    extensionAccessTokenTtlSeconds,
    extensionRefreshTokenTtlSeconds,
  } = config
  const resolvedAuthApiURL = authApiURL || (frontendURL ? `${frontendURL}/api` : '/api')
  const authRouteBaseUrl = `${resolvedAuthApiURL}/auth`

  const extensionAllowlist = new Set(extensionOauthAllowedIds || [])
  const isExtensionFlowConfigured = Boolean(
    extensionAllowlist.size > 0 &&
      internalAuthHandoffPrivateKey &&
      internalAuthHandoffIssuer &&
      internalAuthApiAudience,
  )
  const isExtensionIdAllowed = (extensionId) =>
    typeof extensionId === 'string' &&
    EXTENSION_ID_PATTERN.test(extensionId) &&
    extensionAllowlist.has(extensionId)
  const buildExtensionRedirectUrl = (extensionId, code, state) => {
    const url = new URL(`https://${extensionId}.chromiumapp.org/`)
    url.searchParams.set('code', code)
    url.searchParams.set('state', state)
    return url.toString()
  }

  const loginFailedUrl = `${frontendURL}/?loginFailed=true`
  const isSelfReferentialHandoffUrl = Boolean(
    oidcHandoffAuthorityOrigin && apiOrigin && oidcHandoffAuthorityOrigin === apiOrigin,
  )
  const isHandoffConsumerConfigured = Boolean(
    oidcHandoffUrl && oidcHandoffAuthorityOrigin && oidcHandoffSecret,
  )
  const canMintHandoff = Boolean(oidcHandoffSecret && apiOrigin)
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

  const shouldDelegateToAuthority = () => {
    if (!isHandoffConsumerConfigured) return false
    return !isSelfReferentialHandoffUrl
  }

  router.get('/login/google', (req, res, next) => {
    if (req.query.invite_code) {
      req.session.inviteCode = req.query.invite_code
    }
    const { returnPath } = req.query

    if (shouldDelegateToAuthority()) {
      const url = new URL(oidcHandoffUrl)
      if (returnPath) url.searchParams.set('returnPath', returnPath)
      url.searchParams.set('handoffTarget', getRequestOrigin(req))
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

  router.get('/login/cli', (req, res) => {
    const portFromQuery = parseInt(req.query.callbackPort, 10)
    const callbackPort = Number.isInteger(portFromQuery) && portFromQuery >= 1024 && portFromQuery <= 65535
      ? portFromQuery
      : req.session?.cliCallbackPort

    if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
      return res.status(400).json({ error: 'callbackPort must be an integer between 1024 and 65535' })
    }

    const codeChallenge = req.query.code_challenge ?? req.session?.cliCodeChallenge
    const codeChallengeMethod = req.query.code_challenge_method ?? req.session?.cliCodeChallengeMethod
    const state = req.query.state ?? req.session?.cliState

    if (!codeChallenge || codeChallengeMethod !== 'S256' || !state) {
      return res.status(400).json({ error: 'code_challenge (S256) and state are required' })
    }

    req.session.cliCallbackPort = callbackPort
    req.session.cliCodeChallenge = codeChallenge
    req.session.cliCodeChallengeMethod = codeChallengeMethod
    req.session.cliState = state

    if (req.query.loginFailed === 'true') {
      return res.status(200).type('html').send(renderCliTemplate('failed'))
    }

    if (req.isAuthenticated()) {
      return res.status(200).type('html').send(renderCliTemplate('grant'))
    }

    return res.status(200).type('html').send(renderCliTemplate('login', { CALLBACK_PORT: callbackPort }))
  })

  router.get('/login/cli/google', (req, res, next) => {
    const callbackPort = parseInt(req.query.callbackPort, 10)
    if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
      return res.status(400).json({ error: 'callbackPort must be an integer between 1024 and 65535' })
    }
    return passport.authenticate('openidconnect', { state: { returnToCli: true, cliCallbackPort: callbackPort } })(req, res, next)
  })

  router.post('/login/cli/confirm', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).end()
    const callbackPort = req.session?.cliCallbackPort
    const codeChallenge = req.session?.cliCodeChallenge
    const state = req.session?.cliState
    if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
      return res.status(400).json({ error: 'Session missing CLI callback port' })
    }
    if (!codeChallenge || !state) {
      return res.status(400).json({ error: 'Session missing PKCE parameters' })
    }
    try {
      const code = issueCodeFn(req.user.id, codeChallenge)
      delete req.session.cliCallbackPort
      delete req.session.cliCodeChallenge
      delete req.session.cliCodeChallengeMethod
      delete req.session.cliState
      const callbackUrl = new URL(`http://localhost:${callbackPort}/`)
      callbackUrl.searchParams.set('code', code)
      callbackUrl.searchParams.set('state', state)
      return res.redirect(callbackUrl.toString())
    } catch (e) {
      logger.error(`CLI login/confirm: issuing auth code failed: ${e}`)
      return redirectWithLoginFailed(res)
    }
  })

  router.post('/login/cli/deny', (req, res) => {
    return res.status(200).type('html').send(renderCliTemplate('denied'))
  })

  router.post('/cli-token', async (req, res, next) => {
    try {
      const { code, code_verifier: codeVerifier } = req.body ?? {}
      if (!code || !codeVerifier) {
        return res.status(400).json({ error: 'code and code_verifier are required' })
      }
      const result = consumeCodeFn(code, codeVerifier)
      if (!result) {
        return res.status(401).json({ error: 'Invalid, expired, or already used authorization code' })
      }
      const rawKey = `fp_${uuid()}`
      await createApiKey(result.userId, rawKey, 'CLI')
      return res.json({ access_token: rawKey, token_type: 'bearer' })
    } catch (e) {
      next(e)
    }
  })

  const extensionPageShell = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Fomo Player</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1c1c1c; border: 1px solid #333; border-radius: 12px; padding: 2rem; max-width: 440px; width: 100%; text-align: center; }
    h1 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    p { color: #aaa; font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5; }
    .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    button, .btn { display: inline-block; border: none; border-radius: 8px; padding: 0.6rem 1.5rem; font-size: 0.9rem; cursor: pointer; font-weight: 600; text-decoration: none; }
    .allow { background: #4caf50; color: #fff; }
    .allow:hover { background: #43a047; }
    .deny { background: #333; color: #aaa; }
    .deny:hover { background: #444; }
    .google { background: #fff; color: #333; display: flex; align-items: center; gap: 0.5rem; }
    .google:hover { background: #f5f5f5; }
    .google svg { width: 18px; height: 18px; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`

  router.get('/login/extension', (req, res) => {
    if (!isExtensionFlowConfigured) {
      return res.status(503).json({ error: 'Extension login is not configured on this backend' })
    }

    const requestedExtensionId = req.query.extensionId ?? req.session?.extensionId
    if (!isExtensionIdAllowed(requestedExtensionId)) {
      logger.warn('Rejected extension login: extensionId not allowed', { requestedExtensionId })
      return res.status(400).json({ error: 'Unknown or invalid extensionId' })
    }

    const codeChallenge = req.query.code_challenge ?? req.session?.extensionCodeChallenge
    const codeChallengeMethod = req.query.code_challenge_method ?? req.session?.extensionCodeChallengeMethod
    const state = req.query.state ?? req.session?.extensionState

    if (!codeChallenge || codeChallengeMethod !== 'S256' || !state) {
      return res.status(400).json({ error: 'code_challenge (S256) and state are required' })
    }

    req.session.extensionId = requestedExtensionId
    req.session.extensionCodeChallenge = codeChallenge
    req.session.extensionCodeChallengeMethod = codeChallengeMethod
    req.session.extensionState = state

    if (req.isAuthenticated()) {
      return res.status(200).type('html').send(extensionPageShell('Grant Extension Access',
        `<h1>Grant extension access?</h1>
  <p>The Fomo Player browser extension is requesting access to your account. Allowing will issue a short-lived access token plus a refresh token that you can revoke at any time from your account settings.</p>
  <div class="actions">
    <form method="POST" action="${authRouteBaseUrl}/login/extension/confirm">
      <button type="submit" class="allow btn">Allow</button>
    </form>
    <form method="POST" action="${authRouteBaseUrl}/login/extension/deny">
      <button type="submit" class="deny btn">Deny</button>
    </form>
  </div>`))
    }

    return res.status(200).type('html').send(extensionPageShell('Extension Access',
      `<h1>Fomo Player Extension Access</h1>
  <p>The Fomo Player browser extension is requesting access to your account. Log in to continue.</p>
  <div class="actions">
    <a href="${authRouteBaseUrl}/login/extension/google" class="btn google">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Log in with Google
    </a>
  </div>`))
  })

  router.get('/login/extension/google', (req, res, next) => {
    if (!isExtensionFlowConfigured) {
      return res.status(503).json({ error: 'Extension login is not configured on this backend' })
    }
    return passport.authenticate('openidconnect', { state: { returnToExtension: true } })(req, res, next)
  })

  router.post('/login/extension/confirm', async (req, res) => {
    if (!isExtensionFlowConfigured) {
      return res.status(503).json({ error: 'Extension login is not configured on this backend' })
    }
    if (!req.isAuthenticated()) return res.status(401).end()
    const extensionId = req.session?.extensionId
    const codeChallenge = req.session?.extensionCodeChallenge
    const state = req.session?.extensionState
    if (!isExtensionIdAllowed(extensionId)) {
      return res.status(400).json({ error: 'Session missing or invalid extensionId' })
    }
    if (!codeChallenge || !state) {
      return res.status(400).json({ error: 'Session missing PKCE parameters' })
    }
    try {
      const code = issueCodeFn(req.user.id, codeChallenge)
      delete req.session.extensionId
      delete req.session.extensionCodeChallenge
      delete req.session.extensionCodeChallengeMethod
      delete req.session.extensionState
      return res.redirect(buildExtensionRedirectUrl(extensionId, code, state))
    } catch (e) {
      logger.error(`Extension login/confirm: issuing auth code failed: ${e}`)
      return redirectWithLoginFailed(res)
    }
  })

  router.post('/login/extension/deny', (req, res) => {
    delete req.session.extensionId
    delete req.session.extensionCodeChallenge
    delete req.session.extensionCodeChallengeMethod
    delete req.session.extensionState
    return res.status(200).type('html').send(extensionPageShell('Extension Access Denied',
      `<h1>Access denied</h1>
  <p>The extension login was aborted. You can close this tab.</p>`))
  })

  const issueExtensionAccessToken = async (userId) =>
    tokenServer.issueInternalToken({
      privateKey: internalAuthHandoffPrivateKey,
      keyId: internalAuthHandoffKeyId,
      issuer: internalAuthHandoffIssuer,
      audience: internalAuthApiAudience,
      subject: String(userId),
      expiresInSeconds: extensionAccessTokenTtlSeconds,
      payload: { token_type: 'extension_access' },
    })

  router.post('/extension/token', async (req, res, next) => {
    try {
      if (!isExtensionFlowConfigured) {
        return res.status(503).json({ error: 'Extension login is not configured on this backend' })
      }
      const body = req.body ?? {}
      const { code, code_verifier: codeVerifier, refresh_token: refreshToken, extensionId } = body

      if (refreshToken) {
        const row = await extensionRefreshToken.findRefreshToken(refreshToken)
        if (!row) return res.status(401).json({ error: 'Invalid refresh token' })
        if (row.revoked_at) return res.status(401).json({ error: 'Refresh token revoked' })
        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
          return res.status(401).json({ error: 'Refresh token expired' })
        }
        if (row.replaced_by) {
          logger.warn('Extension refresh token reuse detected; revoking chain', { chainId: row.chain_id })
          await extensionRefreshToken.revokeChain(row.chain_id)
          return res.status(401).json({ error: 'Refresh token reuse detected; chain revoked' })
        }

        const newRawRefresh = `fp_rt_${uuid()}`
        await extensionRefreshToken.rotateRefreshToken({
          oldRowId: row.id,
          userId: row.user_id,
          extensionId: row.extension_id,
          chainId: row.chain_id,
          newRawToken: newRawRefresh,
          ttlSeconds: extensionRefreshTokenTtlSeconds,
        })
        const accessToken = await issueExtensionAccessToken(row.user_id)
        return res.json({
          access_token: accessToken,
          refresh_token: newRawRefresh,
          token_type: 'Bearer',
          expires_in: extensionAccessTokenTtlSeconds,
        })
      }

      if (!code || !codeVerifier) {
        return res.status(400).json({ error: 'code and code_verifier are required' })
      }
      if (!isExtensionIdAllowed(extensionId)) {
        return res.status(400).json({ error: 'Unknown or invalid extensionId' })
      }
      const result = consumeCodeFn(code, codeVerifier)
      if (!result) {
        return res.status(401).json({ error: 'Invalid, expired, or already used authorization code' })
      }
      const rawRefresh = `fp_rt_${uuid()}`
      await extensionRefreshToken.createRefreshToken({
        userId: result.userId,
        extensionId,
        rawToken: rawRefresh,
        ttlSeconds: extensionRefreshTokenTtlSeconds,
      })
      const accessToken = await issueExtensionAccessToken(result.userId)
      return res.json({
        access_token: accessToken,
        refresh_token: rawRefresh,
        token_type: 'Bearer',
        expires_in: extensionAccessTokenTtlSeconds,
      })
    } catch (e) {
      next(e)
    }
  })

  router.post('/extension/logout', async (req, res, next) => {
    try {
      if (!isExtensionFlowConfigured) {
        return res.status(503).json({ error: 'Extension login is not configured on this backend' })
      }
      const { refresh_token: refreshToken } = req.body ?? {}
      if (!refreshToken) return res.status(400).json({ error: 'refresh_token is required' })
      await extensionRefreshToken.revokeRefreshTokenByRaw(refreshToken)
      return res.status(204).end()
    } catch (e) {
      next(e)
    }
  })

  router.get('/.well-known/jwks.json', async (req, res, next) => {
    try {
      if (!internalAuthHandoffPrivateKey && !internalAuthHandoffPublicKey) {
        return res.status(404).json({ error: 'JWKS not configured' })
      }
      let publicKeyPem = internalAuthHandoffPublicKey
      if (!publicKeyPem && internalAuthHandoffPrivateKey) {
        const publicKeyObject = crypto.createPublicKey(internalAuthHandoffPrivateKey)
        publicKeyPem = publicKeyObject.export({ type: 'spki', format: 'pem' })
      }
      const jwk = await tokenServer.getInternalPublicJwk({
        publicKey: publicKeyPem,
        keyId: internalAuthHandoffKeyId,
      })
      if (!jwk) return res.status(404).json({ error: 'JWKS not configured' })
      return res.json({ keys: [jwk] })
    } catch (e) {
      next(e)
    }
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

      const { returnPath, handoffTarget, returnToCli, cliCallbackPort, returnToExtension } = info?.state ?? {}

      if (returnToCli) {
        const port = parseInt(cliCallbackPort, 10)
        if (!Number.isInteger(port) || port < 1024 || port > 65535) return redirectWithLoginFailed(res)
        return req.login(user, (loginErr) => {
          if (loginErr) {
            logger.error('req.login failed after CLI OIDC', { errorMessage: loginErr?.message })
            return redirectWithLoginFailed(res)
          }
          return res.redirect(`${authRouteBaseUrl}/login/cli?callbackPort=${port}`)
        })
      }

      if (returnToExtension) {
        return req.login(user, (loginErr) => {
          if (loginErr) {
            logger.error('req.login failed after extension OIDC', { errorMessage: loginErr?.message })
            return redirectWithLoginFailed(res)
          }
          return res.redirect(`${authRouteBaseUrl}/login/extension`)
        })
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
      if (!isHandoffConsumerConfigured) {
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

      if (
        payload.oidcIssuer === GOOGLE_OIDC_ISSUER &&
        !isGoogleSubAllowed({
          isPreviewEnv,
          previewAllowedGoogleSubs,
          googleSub: payload.sub,
        })
      ) {
        logger.warn('Handoff consume: Google sub not in preview allowlist', { sub: payload.sub })
        return redirectWithLoginFailed(res)
      }

      let user = await account.findByIdentifier(payload.oidcIssuer, payload.sub)

      if (!user) {
        const accountCount = await queryAccountCount()
        const signUpAvailable = accountCount <= maxAccountCount

        if (!signUpAvailable) {
          const inviteCode = req.session?.inviteCode
          if (!inviteCode) {
            logger.warn('Handoff sign-up denied: sign-up closed and no invite code', {
              accountCount,
              maxAccountCount,
            })
            return redirectWithLoginFailed(res)
          }
          const inviteCodeConsumed = await deleteInviteCode(inviteCode)
          if (!inviteCodeConsumed) {
            logger.warn('Handoff sign-up denied: invalid invite code')
            return redirectWithLoginFailed(res)
          }
        }

        user = await account.findOrCreateByIdentifier(payload.oidcIssuer, payload.sub)
      }

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
      const { token, name: rawName = 'fomoplayer CLI' } = req.body ?? {}
      const name = typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim().slice(0, 100) : 'fomoplayer CLI'
      if (!token) return res.status(400).json({ error: 'token is required' })
      if (!canMintHandoff) return res.status(503).json({ error: 'API key exchange not configured' })
      const payload = verifyHandoffTokenFn({ token, secret: oidcHandoffSecret, issuer: apiOrigin, audience: apiOrigin })
      if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
      const expiresAt = new Date(payload.exp * 1000)
      const consumed = await consumeHandoffJti(payload.jti, expiresAt)
      if (!consumed) { logger.warn('CLI exchange: token replay rejected', { jti: payload.jti }); return res.status(401).json({ error: 'Token already used' }) }
      const user = await account.findByIdentifier(payload.oidcIssuer, payload.sub)
      if (!user) return res.status(403).json({ error: 'No account found for this identity. Please log in via the web app first.' })
      const rawKey = `fp_${uuid()}`
      const keyRecord = await createApiKey(user.id, rawKey, name)
      return res.json({ key: rawKey, id: keyRecord.api_key_id, name: keyRecord.api_key_name })
    } catch (e) { next(e) }
  })

  router.get('/me', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).end()
    return res.json({ id: req.user.id })
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

  if (isPreviewEnv && githubActionsOidcRepo) {
    router.post('/login/actions', async (req, res, next) => {
      try {
        const { token } = req.body ?? {}
        if (!token) return res.status(400).json({ error: 'token is required' })

        const payload = await verifyActionsTokenFn({
          token,
          audience: apiOrigin,
          allowedRepo: githubActionsOidcRepo,
        })
        if (!payload) {
          logger.warn('Actions OIDC login rejected: invalid or unauthorized token')
          return res.status(401).json({ error: 'Invalid or unauthorized Actions token' })
        }

        const normalizedIssuer = GITHUB_ACTIONS_ISSUER.replace(/^https?:\/\//, '')
        const user = await account.findOrCreateByIdentifier(normalizedIssuer, githubActionsOidcRepo)
        if (!user) return res.status(500).json({ error: 'Failed to resolve bot user' })

        req.login(user, (err) => {
          if (err) return next(err)
          res.status(204).end()
        })
      } catch (e) {
        next(e)
      }
    })
  }

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
