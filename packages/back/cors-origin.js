const normalizeOriginList = (origins = []) => origins.filter(Boolean)

const parseOriginRegexes = (value) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((pattern) => {
      const stripped = pattern.replace(/^\^/, '').replace(/\$$/, '')
      return new RegExp(`^(?:${stripped})$`)
    })

const createCorsOriginValidator = ({ allowedOrigins = [], allowedOriginRegexes = [] }) => {
  const exactOrigins = new Set(normalizeOriginList(allowedOrigins))

  return (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }

    if (exactOrigins.has(origin) || allowedOriginRegexes.some((regex) => regex.test(origin))) {
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
