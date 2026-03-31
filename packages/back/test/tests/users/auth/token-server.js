const assert = require('assert')
const { test } = require('cascade-test')
const { issueInternalToken, verifyInternalToken, getInternalPublicJwk } = require('../../../../token-server')

test({
  'issueInternalToken and verifyInternalToken roundtrip': async () => {
    const secret = 'test-secret'
    const issuer = 'https://issuer.example.com'
    const audience = 'https://api.example.com'
    const subject = 'subject-123'
    const token = await issueInternalToken({
      secret,
      issuer,
      audience,
      subject,
      expiresInSeconds: 60,
      payload: {
        token_type: 'api_access',
        jti: 'jti-123',
        oidc_iss: 'https://accounts.google.com',
      },
    })

    const payload = await verifyInternalToken({ token, secret, issuer, audience })
    assert.strictEqual(payload.sub, subject)
    assert.strictEqual(payload.aud, audience)
    assert.strictEqual(payload.iss, issuer)
    assert.strictEqual(payload.token_type, 'api_access')
    assert.strictEqual(payload.jti, 'jti-123')
  },

  'verifyInternalToken rejects wrong audience': async () => {
    const secret = 'test-secret'
    const token = await issueInternalToken({
      secret,
      issuer: 'https://issuer.example.com',
      audience: 'https://api.example.com',
      subject: 'subject-123',
      expiresInSeconds: 60,
      payload: { token_type: 'api_access', jti: 'jti-456', oidc_iss: 'https://accounts.google.com' },
    })

    await assert.rejects(
      async () =>
        await verifyInternalToken({
          token,
          secret,
          issuer: 'https://issuer.example.com',
          audience: 'https://different.example.com',
        }),
    )
  },

  'issueInternalToken and verifyInternalToken roundtrip with RS256 key pair': async () => {
    const { generateKeyPair, exportPKCS8, exportSPKI } = await import('jose')
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    const privateKeyPem = await exportPKCS8(privateKey)
    const publicKeyPem = await exportSPKI(publicKey)
    const issuer = 'https://issuer.example.com'
    const audience = 'https://preview.example.com'
    const subject = 'subject-456'

    const token = await issueInternalToken({
      privateKey: privateKeyPem,
      keyId: 'test-kid',
      issuer,
      audience,
      subject,
      expiresInSeconds: 60,
      payload: {
        token_type: 'preview_handoff',
        sid: 'sid-1',
        nonce: 'nonce-1',
        jti: 'jti-789',
        oidc_iss: 'https://accounts.google.com',
      },
    })

    const payload = await verifyInternalToken({
      token,
      publicKey: publicKeyPem,
      issuer,
      audience,
    })

    assert.strictEqual(payload.sub, subject)
    assert.strictEqual(payload.aud, audience)
    assert.strictEqual(payload.iss, issuer)
    assert.strictEqual(payload.token_type, 'preview_handoff')
  },

  'getInternalPublicJwk exports a public JWK with metadata': async () => {
    const { generateKeyPair, exportSPKI } = await import('jose')
    const { publicKey } = await generateKeyPair('RS256', { extractable: true })
    const publicKeyPem = await exportSPKI(publicKey)
    const jwk = await getInternalPublicJwk({ publicKey: publicKeyPem, keyId: 'kid-1' })

    assert.strictEqual(jwk.kid, 'kid-1')
    assert.strictEqual(jwk.alg, 'RS256')
    assert.strictEqual(jwk.use, 'sig')
    assert.strictEqual(jwk.kty, 'RSA')
  },
})

