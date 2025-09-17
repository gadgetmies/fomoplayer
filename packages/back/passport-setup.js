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

const consumeInviteCode = async (inviteCode) => {
  const deleteCount = await deleteInviteCode(inviteCode)
  if (deleteCount === 1) {
    return true
  } else if (deleteCount === 0) {
    return false
  }
  throw new Error('Consumed more than one invite code')
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
        callbackURL: `${config.apiURL}/auth/login/google/return`,
        passReqToCallback: true,
      },
      async (req, issuer, profile, done) => {
        if (profile.id === undefined) {
          throw new Error('OIDC profile id not returned!')
        }

        try {
          const inviteCode = req.session.inviteCode
          const signUpAvailable = (await queryAccountCount()) <= config.maxAccountCount
          let user = await account.findByIdentifier(issuer, profile.id)

          if (!user) {
            if (!signUpAvailable) {
              if (!inviteCode) {
                return done(null, false, { message: 'Sign up is not available' })
              } else {
                const inviteCodeConsumed = await consumeInviteCode(inviteCode)
                if (!inviteCodeConsumed) {
                  return done(null, false, { message: 'Invalid invite code' })
                }
              }
            }

            user = await account.findOrCreateByIdentifier(issuer, profile.id)
          }

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
  const allowedIssuers = ['accounts.google.com', 'https://accounts.google.com']

  const verify = async (jwt_payload, done) => {
    if (jwt_payload && jwt_payload.sub && allowedIssuers.includes(jwt_payload.iss)) {
      try {
        const acc = await account.findOrCreateByIdentifier(jwt_payload.iss, jwt_payload.sub)
        if (acc) {
          return done(null, acc)
        } else {
          return done(null, false)
        }
      } catch (e) {
        logger.error('OIDC verification failed', e)
        return done(e)
      }
    }

    return done(null, false)
  }

  passport.use(
    new JwtStrategy(
      {
        // Dynamically provide a signing key based on the kid in the header and the signing keys provided by the JWKS endpoint.
        secretOrKeyProvider: jwksRsa.passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: `https://www.googleapis.com/oauth2/v3/certs`,
        }),
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      },
      verify,
    ),
  )

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
