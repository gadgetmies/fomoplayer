const account = require('../../db/account')
const { pg } = require('./db')

module.exports.resolveTestUserId = async () => {
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
