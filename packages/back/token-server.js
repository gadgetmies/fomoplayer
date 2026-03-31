const googleOidcIssuers = ['accounts.google.com', 'https://accounts.google.com']

let joseModulePromise
let googleJwks
const internalRemoteJwks = new Map()
const internalPrivateKeyCache = new Map()
const internalPublicKeyCache = new Map()

const getJose = async () => {
  if (!joseModulePromise) {
    joseModulePromise = import('jose')
  }
  return await joseModulePromise
}

const getGoogleJwks = async () => {
  if (!googleJwks) {
    const { createRemoteJWKSet } = await getJose()
    googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  }
  return googleJwks
}

const getSecret = (secret) => new TextEncoder().encode(secret)

const getInternalRemoteJwks = async (jwksUrl) => {
  if (!internalRemoteJwks.has(jwksUrl)) {
    const { createRemoteJWKSet } = await getJose()
    internalRemoteJwks.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl)))
  }
  return internalRemoteJwks.get(jwksUrl)
}

const getInternalPrivateKey = async (privateKey) => {
  if (!internalPrivateKeyCache.has(privateKey)) {
    const { importPKCS8 } = await getJose()
    internalPrivateKeyCache.set(privateKey, await importPKCS8(privateKey, 'RS256'))
  }
  return internalPrivateKeyCache.get(privateKey)
}

const getInternalPublicKey = async (publicKey) => {
  if (!internalPublicKeyCache.has(publicKey)) {
    const { importSPKI } = await getJose()
    internalPublicKeyCache.set(publicKey, await importSPKI(publicKey, 'RS256'))
  }
  return internalPublicKeyCache.get(publicKey)
}

module.exports.issueInternalToken = async ({
  secret,
  privateKey,
  keyId,
  issuer,
  audience,
  subject,
  expiresInSeconds,
  payload = {},
}) => {
  const { SignJWT } = await getJose()
  const now = Math.floor(Date.now() / 1000)
  const signedToken = new SignJWT(payload)
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)

  if (privateKey) {
    signedToken.setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(keyId ? { kid: keyId } : {}) })
    return await signedToken.sign(await getInternalPrivateKey(privateKey))
  }

  if (!secret) {
    throw new Error('Internal token signing key is not configured')
  }

  signedToken.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  return await signedToken.sign(getSecret(secret))
}

module.exports.verifyInternalToken = async ({ token, secret, publicKey, jwksUrl, issuer, audience }) => {
  const { jwtVerify } = await getJose()
  let key
  let algorithms
  if (secret) {
    key = getSecret(secret)
    algorithms = ['HS256']
  } else if (publicKey) {
    key = await getInternalPublicKey(publicKey)
    algorithms = ['RS256']
  } else if (jwksUrl) {
    key = await getInternalRemoteJwks(jwksUrl)
    algorithms = ['RS256']
  } else {
    throw new Error('Internal token verification key is not configured')
  }

  const { payload } = await jwtVerify(token, key, { issuer, audience, algorithms })
  return payload
}

module.exports.verifyGoogleIdToken = async ({ id_token, googleClientId }) => {
  const { jwtVerify } = await getJose()
  const { payload } = await jwtVerify(id_token, await getGoogleJwks(), {
    issuer: googleOidcIssuers,
    audience: googleClientId,
  })
  return payload
}

module.exports.getInternalPublicJwk = async ({ publicKey, keyId }) => {
  if (!publicKey) {
    return undefined
  }
  const { exportJWK } = await getJose()
  const jwk = await exportJWK(await getInternalPublicKey(publicKey))
  return {
    ...jwk,
    use: 'sig',
    alg: 'RS256',
    ...(keyId ? { kid: keyId } : {}),
  }
}

