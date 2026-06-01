const config = require('../../config.js')
const account = require('../../db/account.js')

const adminUserSubs = (process.env.ADMIN_USER_SUBS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

module.exports.ensureAuthenticated = (req, res, next) => {
  return req.isAuthenticated() ? next() : res.status(401).end()
}

// Admin is granted to users whose OIDC subject is listed in ADMIN_USER_SUBS, or
// (preview only) to the GitHub Actions bot whose verified sub matched the
// configured admin sub at login. Subjects come from the user's stored OIDC
// identities (req.user.oidcSubjects) plus the identity of the current login.
const isAdmin = (req) => {
  const subjects = [
    ...(req.user?.oidcSubjects ?? []),
    ...(req.user?.oidcIdentity?.subject ? [req.user.oidcIdentity.subject] : []),
  ]
  const grantedBySub = subjects.some((sub) => adminUserSubs.includes(sub))
  // The Actions bot admin session flag is only ever set by /login/actions,
  // which is only registered in preview envs; re-check isPreviewEnv here as
  // defence-in-depth so it can never grant admin in production.
  const grantedByActionsBot = config.isPreviewEnv === true && req.session?.isActionsAdmin === true
  return grantedBySub || grantedByActionsBot
}

module.exports.isAdmin = isAdmin

// Resolve admin status from a user id (the mint paths have no Express `req` to
// feed `isAdmin`). Loads the account's stored OIDC subjects and checks them
// against the same ADMIN_USER_SUBS rule used at request time.
const isAdminUserId = async (userId) => {
  const { oidcSubjects = [] } = await account.findByUserId(userId)
  return oidcSubjects.some((sub) => adminUserSubs.includes(sub))
}

module.exports.isAdminUserId = isAdminUserId

module.exports.ensureIsAdmin = (req, res, next) => {
  if (isAdmin(req)) {
    next()
  } else {
    res.status(403).send({ error: 'Access denied' })
  }
}
