// Whether the destructive "reset the database" admin feature may run.
//
// The ONLY signal that distinguishes a preview/review deployment from
// production is PREVIEW_ENV (surfaced as config.isPreviewEnv). NODE_ENV is
// deliberately NOT consulted: Heroku review apps run with NODE_ENV=production
// just like the real production app, so config.isProduction is true in preview
// too and gating on it would wrongly disable the feature in preview while
// adding no protection. This mirrors the Actions-bot admin gate in
// routes/shared/auth.js, whose comment notes isPreviewEnv is the
// defence-in-depth that "can never grant admin in production". Production never
// sets PREVIEW_ENV=true, so the reset can never be available there.
const isDatabaseResetAllowed = ({ isPreviewEnv } = {}) => isPreviewEnv === true

module.exports = { isDatabaseResetAllowed }
