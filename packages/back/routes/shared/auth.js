const config = require('../../config.js')

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

module.exports.ensureIsAdmin = (req, res, next) => {
  if (isAdmin(req)) {
    next()
  } else {
    res.status(403).send({ error: 'Access denied' })
  }
}
