// Normalize the App URL before it is used.
//
// Endpoint paths are concatenated onto the App URL as `${appUrl}${path}`
// (e.g. `${appUrl}/api/...` in auth.js / service_worker.js), so a trailing
// slash on the URL would produce a double slash (`https://host//api/...`).
// Strip any trailing slashes so the value is always slash-free. Applied both
// when saving the user-configured URL in Options and when reading it back
// (getAppUrl), so an already-stored trailing slash — or a DEFAULT_APP_URL baked
// from a FRONTEND_URL that ends in a slash — is normalized too.
const normalizeAppUrl = (url) => String(url ?? '').trim().replace(/\/+$/, '')

module.exports = { normalizeAppUrl }
