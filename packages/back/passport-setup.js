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
const { evaluateSignUpPolicy } = require('./routes/shared/auth-flow')

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
  passport.use(
    new OpenIDStrategy(
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
        if (profile.id === undefined) {
          throw new Error('OIDC profile id not returned!')
        }

        try {
          const oidcState = parseOidcState(req)
          const isHandoffState = Boolean(
            (oidcState?.preview_session_id && oidcState?.preview_nonce) || req.session?.oidcHandoff?.nonce,
          )
          if (isHandoffState) {
            const user = { id: null }
            user.oidcIssuer = issuer
            user.oidcSubject = profile.id
            done(null, user)
            return
          }

          let user = await account.findByIdentifier(issuer, profile.id)

          if (!user) {
            const signUpPolicy = await evaluateSignUpPolicy({
              inviteCode: req.session.inviteCode,
              queryAccountCount,
              maxAccountCount: config.maxAccountCount,
              deleteInviteCode,
            })
            if (!signUpPolicy.allowed) {
              if (signUpPolicy.error === 'sign_up_not_available') {
                return done(null, false, { message: 'Sign up is not available' })
              }
              if (signUpPolicy.error === 'invalid_invite_code') {
                return done(null, false, { message: 'Invalid invite code' })
              }
            }

            user = await account.findOrCreateByIdentifier(issuer, profile.id)
          }

          user.oidcIssuer = issuer
          user.oidcSubject = profile.id
          done(null, user)
          await pgrm.queryAsync(
            //language=PostgreSQL
            sql` -- open id login
UPDATE meta_account SET meta_account_last_login = NOW() WHERE meta_account_user_id = ${user.id} 
`,
          )
        } catch (e) {
          logger.error('Creating or fetching user for OIDC failed', e)
          done(null)
        }
      },
    ),
  )

  const JwtStrategy = require('passport-jwt').Strategy
  const ExtractJwt = require('passport-jwt').ExtractJwt
  const jwksRsa = require('jwks-rsa')
  const internalJwtStrategyOptions = config.internalAuthHandoffJwksUrl
    ? {
        secretOrKeyProvider: jwksRsa.passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: config.internalAuthHandoffJwksUrl,
        }),
        algorithms: ['RS256'],
      }
    : undefined

  if (internalJwtStrategyOptions && config.internalAuthHandoffIssuer) {
    const verifyInternal = async (_req, jwtPayload, done) => {
      if (
        !jwtPayload ||
        jwtPayload.token_type !== 'api_access' ||
        !jwtPayload.sub ||
        !jwtPayload.oidc_iss ||
        jwtPayload.aud !== config.internalAuthApiAudience
      ) {
        return done(null, false)
      }

      try {
        const acc = await account.findOrCreateByIdentifier(jwtPayload.oidc_iss, jwtPayload.sub)
        if (acc) {
          return done(null, acc)
        }
        return done(null, false)
      } catch (e) {
        logger.error('Internal JWT verification failed', e)
        return done(e)
      }
    }

    passport.use(
      'jwt-internal',
      new JwtStrategy(
        {
          ...internalJwtStrategyOptions,
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          issuer: config.internalAuthHandoffIssuer,
          audience: config.internalAuthApiAudience,
          passReqToCallback: true,
        },
        verifyInternal,
      ),
    )
  }

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
