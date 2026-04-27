'use strict'

const config = require('./config.js')
const passport = require('passport')
const account = require('./db/account.js')
const LocalStrategy = require('passport-local').Strategy
const OpenIDStrategy = require('passport-openidconnect').Strategy
const logger = require('fomoplayer_shared').logger(__filename)

const pgrm = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { queryAccountCount } = require('./routes/db')
const { deleteInviteCode } = require('./db/account')

const parseOidcState = (req) => {
  const rawState = req?.query?.state
  if (!rawState) {
    return undefined
  }

  if (typeof rawState === 'object') {
    return rawState
  }

  if (typeof rawState === 'string') {
    try {
      return JSON.parse(rawState)
    } catch (_) {
      return undefined
    }
  }

  return undefined
}

module.exports = function passportSetup() {
  if (process.env.NODE_ENV !== 'production') {
    const checkCredentials = async (username, password, done) => {
      const result = await account.authenticate(username, password)
      if (result) {
        return done(null, result)
      } else {
        return done(null, false, { message: 'Incorrect username or password' })
      }
    }

    passport.use(new LocalStrategy(checkCredentials))
  }

  const googleOpenIDIssuer = 'accounts.google.com'
  const googleOidcConfigured = Boolean(config.googleClientId && config.googleClientSecret)
  if (!googleOidcConfigured) {
    logger.info('Google OIDC client credentials not configured; skipping OIDC strategy registration')
  } else {
    passport.use(new OpenIDStrategy(
      {
        issuer: googleOpenIDIssuer,
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        authorizationURL: 'https://accounts.google.com/o/oauth2/auth',
        tokenURL: 'https://www.googleapis.com/oauth2/v3/token',
        callbackURL: config.googleOidcApiRedirect || `${config.apiURL}/auth/login/google/return`,
        passReqToCallback: true,
      },
      async (req, issuer, profile, done) => {
        try {
          if (!profile || profile.id === undefined) {
            logger.error('OIDC profile id not returned by provider', { issuer, profile })
            return done(null, false, { message: 'OIDC profile id not returned' })
          }

          const normalizedIssuer = issuer.replace(/^https?:\/\//, '')
          const oidcIdentity = { issuer: normalizedIssuer, subject: profile.id }

          const inviteCode = req.session?.inviteCode
          const accountCount = await queryAccountCount()
          const signUpAvailable = accountCount <= config.maxAccountCount
          let user = await account.findByIdentifier(normalizedIssuer, profile.id)

          if (!user) {
            if (!signUpAvailable) {
              if (!inviteCode) {
                logger.warn('OIDC sign-up denied: sign-up closed and no invite code', {
                  accountCount,
                  maxAccountCount: config.maxAccountCount,
                })
                return done(null, false, { message: 'Sign up is not available' })
              }
              const inviteCodeConsumed = await deleteInviteCode(inviteCode)
              if (!inviteCodeConsumed) {
                logger.warn('OIDC sign-up denied: invalid invite code')
                return done(null, false, { message: 'Invalid invite code' })
              }
            }

            user = await account.findOrCreateByIdentifier(normalizedIssuer, profile.id)
          }

          if (!user || user.id === undefined) {
            logger.error('OIDC verify: user lookup/create returned no usable user', { user })
            return done(null, false, { message: 'User lookup failed' })
          }

          done(null, { ...user, oidcIdentity })
          try {
            await pgrm.queryAsync(
              //language=PostgreSQL
              sql` -- open id login
UPDATE meta_account SET meta_account_last_login = NOW() WHERE meta_account_user_id = ${user.id}
`,
            )
          } catch (e) {
            logger.error('Failed to update last login timestamp after OIDC login', {
              errorMessage: e?.message ?? String(e),
              stack: e?.stack,
            })
          }
        } catch (e) {
          logger.error('Creating or fetching user for OIDC failed', {
            errorMessage: e?.message ?? String(e),
            stack: e?.stack,
          })
          done(e)
        }
      },
    ))
  }


  const CustomStrategy = require('passport-custom').Strategy
  const { findApiKeyByRaw, touchApiKey } = require('./db/api-key')
  const { apiKeyRateLimiter } = require('./routes/shared/api-key-rate-limiter')

  passport.use('api-key', new CustomStrategy(async (req, done) => {
    try {
      const authHeader = req.headers.authorization ?? ''
      if (!authHeader.startsWith('Bearer fp_')) return done(null, false)
      const rawKey = authHeader.slice(7)
      const keyRecord = await findApiKeyByRaw(rawKey)
      if (!keyRecord || keyRecord.api_key_revoked_at) return done(null, false)
      const rl = apiKeyRateLimiter.check(keyRecord.api_key_id, {
        perMinute: keyRecord.rate_limit_per_minute,
        perDay: keyRecord.rate_limit_per_day,
      })
      if (!rl.allowed) return done(null, false, { rateLimited: true, ...rl })
      touchApiKey(keyRecord.api_key_id).catch(() => {})
      let user
      try {
        user = await account.findByUserId(keyRecord.meta_account_user_id)
      } catch (e) {
        if (e.message && e.message.includes('User not found')) return done(null, false)
        throw e
      }
      return done(null, user ?? false)
    } catch (e) {
      return done(e)
    }
  }))


  passport.serializeUser(async (userToSerialize, done) => {
    try {
      return done(null, userToSerialize.id)
    } catch (e) {
      done(e)
    }
  })
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, await account.findByUserId(id))
    } catch (e) {
      done(e)
    }
  })
}
