const isSafeRedirectPath = (url, trustedOrigins) => {
  if (!url) return false
  const origins = Array.isArray(trustedOrigins) ? trustedOrigins : [trustedOrigins]
  if (url.startsWith('//') || url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parseable = url.startsWith('//') ? `https:${url}` : url
      const urlOrigin = new URL(parseable).origin
      return origins.some((origin) => {
        try {
          return urlOrigin === new URL(origin).origin
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  }
  if (url.includes('\\')) return false
  return url.startsWith('/')
}

module.exports = { isSafeRedirectPath }
