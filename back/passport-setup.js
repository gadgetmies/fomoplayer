"use strict"

const passport = require('passport')
const Strategy = require('passport-local').Strategy
const account = require('./db/account.js')

const checkCredentials = (username, password, done) => {
  return account.authenticate(username, password)
    .then(success => success ? { username: username } : false)
    .asCallback(done)
}

module.exports = function passportSetup() {
  passport.use(new Strategy(checkCredentials))

  passport.serializeUser((userToSerialize, done) => done(null, userToSerialize.username))
  passport.deserializeUser((username, done) => account.findByUsername(username).nodeify(done))
}
