const isLocalhost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1'

module.exports = ({ apiURL, rawApiURL, hostname, isBrowserRuntime }) => {
  if (rawApiURL) {
    return rawApiURL
  }

  if (isBrowserRuntime && !isLocalhost(hostname)) {
    return '/api'
  }

  return apiURL
}
