const normalizeOriginList = (origins = []) =>
  origins.filter(Boolean).map((origin) => origin.toLowerCase())

const parseOriginRegexes = (value) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((pattern) => new RegExp(pattern))

const createCorsOriginValidator = ({ allowedOrigins = [], allowedOriginRegexes = [] }) => {
  const exactOrigins = new Set(normalizeOriginList(allowedOrigins))

  return (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }

    const normalizedOrigin = origin.toLowerCase()
    if (exactOrigins.has(normalizedOrigin) || allowedOriginRegexes.some((regex) => regex.test(normalizedOrigin))) {
      callback(null, true)
      return
    }

    callback(new Error(`CORS origin denied: ${origin}`))
  }
}

module.exports = {
  createCorsOriginValidator,
  parseOriginRegexes,
}
