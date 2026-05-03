// Cross-browser WebExtensions API shim.
//
// On Chrome the `browser.*` namespace does not exist by default; the polyfill
// wraps the callback-style `chrome.*` API and exposes it as a promise-based
// `browser.*` namespace identical to the one Firefox / Safari ship natively.
// Importing this module gives every caller a single `browser` to talk to.
import polyfill from 'webextension-polyfill'

const runtime = typeof browser !== 'undefined' ? browser : polyfill

export default runtime
