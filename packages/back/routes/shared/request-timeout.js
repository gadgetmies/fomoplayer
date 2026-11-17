const timeout = require('connect-timeout')

// Requests are answered with a 503 after 25 s. The analyser's fingerprint uploads are the exception: a Bandcamp
// preview is a full track, and storing its 10,000-30,000 fingerprints in one transaction can take longer. They keep
// running past 25 s anyway, so the short limit only told the analyser an upload failed that then succeeded. They get
// the analyser's own request timeout instead.
const DEFAULT_TIMEOUT = '25s'
const FINGERPRINT_UPLOAD_TIMEOUT = '120s'
const FINGERPRINT_UPLOAD_PATHS = [
  '/api/admin/exact-match/previews/fingerprints',
  '/api/admin/exact-match/audio-samples/fingerprints',
]

const createRequestTimeout = ({
  defaultTimeout = DEFAULT_TIMEOUT,
  fingerprintUploadTimeout = FINGERPRINT_UPLOAD_TIMEOUT,
  fingerprintUploadPaths = FINGERPRINT_UPLOAD_PATHS,
} = {}) => {
  const defaultLimit = timeout(defaultTimeout)
  const fingerprintUploadLimit = timeout(fingerprintUploadTimeout)
  return (req, res, next) =>
    (req.method === 'POST' && fingerprintUploadPaths.includes(req.path) ? fingerprintUploadLimit : defaultLimit)(
      req,
      res,
      next,
    )
}

module.exports = { createRequestTimeout, FINGERPRINT_UPLOAD_PATHS }
