'use strict'

const config = require('./config.js')
const passport = require('passport')
const account = require('./db/account.js')
const LocalStrategy = require('passport-local').Strategy
const OpenIDStrategy = require('passport-openidconnect').Strategy
const logger = require('./logger')(__filename)

module.exports = function passportSetup() {
  const checkCredentials = (username, password, done) =>
    account
      .authenticate(username, password)
      .then(success => (success ? { username } : false))
      .asCallback(done)

  passport.use(new LocalStrategy(checkCredentials))

  const googleOpenIDIssuer = 'accounts.google.com'
  passport.use(
    new OpenIDStrategy(
      {
        issuer: googleOpenIDIssuer,
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        authorizationURL: 'https://accounts.google.com/o/oauth2/auth',
        tokenURL: 'https://www.googleapis.com/oauth2/v3/token',
        userInfoURL: 'https://openidconnect.googleapis.com/v1/userinfo',
        callbackURL: `${config.apiURL}/auth/login/google/return`
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await account.findOrCreateByIdentifier(googleOpenIDIssuer, profile.id)
          done(null, user)
        } catch (e) {
          logger.error('error', e)
          done(null)
        }
      }
    )
  )

  const JwtStrategy = require('passport-jwt').Strategy
  const ExtractJwt = require('passport-jwt').ExtractJwt
  const jwksRsa = require('jwks-rsa')
  const allowedIssuers = ['accounts.google.com', 'https://accounts.google.com']

  const verify = async (jwt_payload, done) => {
    if (jwt_payload && jwt_payload.sub && allowedIssuers.includes(jwt_payload.iss)) {
      const acc = await account.findOrCreateByIdentifier(jwt_payload.iss, jwt_payload.sub)
      if (acc) {
        return done(null, acc)
      } else {
        return done(null, false)
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
          jwksUri: `https://www.googleapis.com/oauth2/v3/certs`
        }),
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
      },
      verify
    )
  )

  passport.serializeUser((userToSerialize, done) => done(null, userToSerialize.username))
  passport.deserializeUser((username, done) => account.findByUsername(username).nodeify(done))
}
