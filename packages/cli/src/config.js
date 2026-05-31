'use strict'

// conf@10 is the last CJS-compatible version of the conf package
const Conf = require('conf')

const conf = new Conf({ projectName: 'fomoplayer' })

const getApiKey = () => conf.get('apiKey') || null

const setApiKey = (key) => conf.set('apiKey', key)

const clearApiKey = () => conf.delete('apiKey')

// Reads FOMOPLAYER_API_URL env. Per repo CLAUDE.md the deployment URL is not
// baked into the source — the user is expected to set the env var (e.g. in a
// shell profile or via `FOMOPLAYER_API_URL=… fomoplayer …`). The value is the
// API base URL including the `/api` prefix (matching the analyser convention),
// e.g. `https://fomoplayer.com/api`. A trailing slash is tolerated and stripped
// so callers can use either form.
const getApiUrl = () => {
  const url = process.env.FOMOPLAYER_API_URL
  if (!url) {
    throw new Error(
      'FOMOPLAYER_API_URL must be set (e.g. https://fomoplayer.com/api). ' +
        'Export it in your shell profile or pass it inline before invoking the CLI.',
    )
  }
  return url.replace(/\/+$/, '')
}

module.exports = { getApiKey, setApiKey, clearApiKey, getApiUrl }
