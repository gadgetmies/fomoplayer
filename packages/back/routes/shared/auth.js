const config = require('../../config.js')

const adminUserIds = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n))

module.exports.ensureAuthenticated = (req, res, next) => {
  return req.isAuthenticated() ? next() : res.status(401).end()
}

const isAdmin = (req) => {
  const userId = req.user?.id
  // The Actions bot admin session flag is only ever set by /login/actions,
  // which is only registered in preview envs; re-check isPreviewEnv here as
  // defence-in-depth so it can never grant admin in production.
  const grantedByActionsBot = config.isPreviewEnv === true && req.session?.isActionsAdmin === true
  return adminUserIds.includes(userId) || grantedByActionsBot
}

module.exports.isAdmin = isAdmin

module.exports.ensureIsAdmin = (req, res, next) => {
  if (isAdmin(req)) {
    next()
  } else {
    res.status(403).send({ error: 'Access denied' })
  }
}
