const account = require('../../db/account')
const { pg } = require('./db')
const { getBrowserContext } = require('./setup')

const isRemotePreview = Boolean(process.env.PREVIEW_URL)

module.exports.resolveTestUserId = async () => {
  if (isRemotePreview) {
    // Bot user was created when logging in via GitHub Actions OIDC. Fetch their
    // ID from the session using the browser context's cookie jar.
    const ctx = getBrowserContext()
    const res = await ctx.request.get(`${process.env.PREVIEW_URL}/api/auth/me`)
    if (!res.ok()) throw new Error(`GET /api/auth/me failed: HTTP ${res.status()}`)
    const { id } = await res.json()
    return id
  }

  const authResult = await account.authenticate('testuser', 'testpwd')
  if (!authResult?.id) {
    throw new Error('Could not resolve test user id')
  }
  const userId = authResult.id
  const [{ cartCount }] = await pg.queryRowsAsync(
    'SELECT COUNT(*)::int AS "cartCount" FROM cart WHERE meta_account_user_id = $1',
    [userId],
  )
  const [{ weightCount }] = await pg.queryRowsAsync(
    'SELECT COUNT(*)::int AS "weightCount" FROM user_track_score_weight WHERE meta_account_user_id = $1',
    [userId],
  )
  if (cartCount === 0 || weightCount === 0) {
    await account.initializeNewUser(userId)
  }
  return userId
}
