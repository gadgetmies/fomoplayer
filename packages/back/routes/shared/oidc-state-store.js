const jwt = require('jsonwebtoken')

const STATE_TOKEN_AUDIENCE = 'oidc-state'
const STATE_TOKEN_TTL_SECONDS = 10 * 60
const STATE_TOKEN_CLOCK_TOLERANCE_SECONDS = 5

function StatelessStateStore({ secret, issuer }) {
  if (!secret) throw new TypeError('StatelessStateStore requires a secret')
  if (!issuer) throw new TypeError('StatelessStateStore requires an issuer')
  this._secret = secret
  this._issuer = issuer
}

StatelessStateStore.prototype.store = function store(req, ctx, appState, meta, cb) {
  try {
    const payload = {
      ctx: ctx ?? null,
      appState: appState ?? null,
    }
    const token = jwt.sign(payload, this._secret, {
      algorithm: 'HS256',
      issuer: this._issuer,
      audience: STATE_TOKEN_AUDIENCE,
      expiresIn: STATE_TOKEN_TTL_SECONDS,
    })
    cb(null, token)
  } catch (e) {
    cb(e)
  }
}

StatelessStateStore.prototype.verify = function verify(req, providedHandle, cb) {
  if (!providedHandle || typeof providedHandle !== 'string') {
    return cb(null, false, { message: 'Unable to verify authorization request state.' })
  }
  let payload
  try {
    payload = jwt.verify(providedHandle, this._secret, {
      algorithms: ['HS256'],
      issuer: this._issuer,
      audience: STATE_TOKEN_AUDIENCE,
      clockTolerance: STATE_TOKEN_CLOCK_TOLERANCE_SECONDS,
    })
  } catch (e) {
    return cb(null, false, { message: 'Invalid authorization request state.' })
  }
  const ctx = payload?.ctx
  if (ctx && typeof ctx === 'object' && typeof ctx.issued === 'string') {
    ctx.issued = new Date(ctx.issued)
  }
  const appState = payload?.appState ?? null
  return cb(null, ctx ?? {}, appState)
}

module.exports = {
  StatelessStateStore,
  STATE_TOKEN_AUDIENCE,
  STATE_TOKEN_TTL_SECONDS,
}
