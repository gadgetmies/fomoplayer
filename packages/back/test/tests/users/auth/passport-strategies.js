const assert = require('assert')
const passport = require('passport')
const { test } = require('cascade-test')

const configPath = require.resolve('../../../../config.js')
const passportSetupPath = require.resolve('../../../../passport-setup.js')

const clearStrategies = () => {
  ;['local', 'openidconnect', 'jwt', 'jwt-internal'].forEach((name) => {
    try {
      passport.unuse(name)
    } catch (_) {}
  })
}

const runPassportSetupWithConfig = (config) => {
  const originalConfigModule = require.cache[configPath]
  clearStrategies()
  delete require.cache[passportSetupPath]
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: config,
  }
  const passportSetup = require(passportSetupPath)
  passportSetup()
  if (originalConfigModule) {
    require.cache[configPath] = originalConfigModule
  } else {
    delete require.cache[configPath]
  }
}

test({
  'passport setup does not register direct google bearer jwt strategy': async () => {
    runPassportSetupWithConfig({
      googleClientId: 'google-client-id',
      googleClientSecret: 'google-client-secret',
      googleOidcApiRedirect: 'https://api.example.com/auth/login/google/return',
      apiURL: 'https://api.example.com/api',
      maxAccountCount: 100,
      internalAuthHandoffIssuer: 'https://api.example.com',
      internalAuthHandoffJwksUrl: 'https://api.example.com/auth/.well-known/jwks.json',
      internalAuthApiAudience: 'https://api.example.com/api',
    })

    assert.strictEqual(passport._strategy('jwt'), undefined)
    assert.notStrictEqual(passport._strategy('jwt-internal'), undefined)
  },
})
