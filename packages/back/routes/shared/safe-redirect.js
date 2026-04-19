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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isSafeHandoffTarget = (url) => {
  if (!url) return false
  const service = process.env.RAILWAY_SERVICE_NAME
  const project = process.env.RAILWAY_PROJECT_NAME
  if (!service || !project) return false
  const pattern = new RegExp(
    `^${escapeRegex(service)}-${escapeRegex(project)}-pr-\\d+\\.up\\.railway\\.app$`,
    'i',
  )
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && pattern.test(hostname)
  } catch {
    return false
  }
}

module.exports = { isSafeRedirectPath, isSafeHandoffTarget }
