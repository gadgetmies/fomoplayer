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

const evaluateHandoffTarget = (url, allowedOriginRegexes = []) => {
  if (!url) return { ok: false, subReason: 'missing-or-invalid-url' }
  if (!Array.isArray(allowedOriginRegexes) || allowedOriginRegexes.length === 0) {
    return { ok: false, subReason: 'allowlist-not-configured' }
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, subReason: 'missing-or-invalid-url' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, subReason: 'origin-not-allowed' }
  }
  const matches = allowedOriginRegexes.some((regex) => regex.test(parsed.origin))
  if (!matches) return { ok: false, subReason: 'origin-not-allowed' }
  return { ok: true }
}

const isSafeHandoffTarget = (url, allowedOriginRegexes) =>
  evaluateHandoffTarget(url, allowedOriginRegexes).ok

module.exports = { isSafeRedirectPath, isSafeHandoffTarget, evaluateHandoffTarget }
