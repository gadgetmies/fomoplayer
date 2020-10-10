const os = require('os')

module.exports = (url, interfaceName, port, path) => {
  if (url) {
    return url
  }

  const getIPv4AddressOfInterface = interfaceName =>
    os.networkInterfaces()[interfaceName].find(({ family }) => family === 'IPv4').address

  if (interfaceName) {
    const currentIp = getIPv4AddressOfInterface(interfaceName)
    return `http://${currentIp}:${port}`
  } else {
    return url || `http://localhost:${port}${path || ''}`
  }
}
