const assert = require('assert')
const { test } = require('cascade-test')

const { generateToken, validateToken } = require('../../../services/email-unsubscribe')

const SECRET = 'unit-test-secret'

test({
  'email unsubscribe token': {
    'round-trips a plain address': async () => {
      const address = 'listener@example.com'
      const token = generateToken(address, SECRET)
      assert.equal(validateToken(token, SECRET), address)
    },

    'survives + and unicode addresses via base64url': async () => {
      const address = 'user+tag@例え.com'
      const token = generateToken(address, SECRET)
      // base64url must not contain +, / or = padding
      assert.ok(!/[+/=]/.test(token), 'token should be base64url-safe')
      assert.equal(validateToken(token, SECRET), address)
    },

    'rejects a tampered signature': async () => {
      const token = generateToken('listener@example.com', SECRET)
      const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')
      assert.equal(validateToken(tampered, SECRET), null)
    },

    'rejects a tampered address': async () => {
      const token = generateToken('listener@example.com', SECRET)
      const [, sig] = token.split('.')
      const forged = `${Buffer.from('attacker@example.com').toString('base64url')}.${sig}`
      assert.equal(validateToken(forged, SECRET), null)
    },

    'rejects a token signed with a different secret': async () => {
      const token = generateToken('listener@example.com', SECRET)
      assert.equal(validateToken(token, 'other-secret'), null)
    },

    'rejects malformed tokens without throwing': async () => {
      for (const bad of [undefined, null, '', 'nodot', 'a.b.c', '!!!.???']) {
        assert.equal(validateToken(bad, SECRET), null)
      }
    },
  },
})
