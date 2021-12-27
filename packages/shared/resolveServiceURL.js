module.exports = (url, ip, port, path) => {
  if (url) {
    return url
  }

  if (ip) {
    return `http://${ip}:${port}`
  } else {
    return url || `http://localhost:${port}${path || ''}`
  }
}
