const R = require('ramda')
const os = require('os')

const getIPv4AddressOfInterface = interfaceName =>
  os.networkInterfaces()[interfaceName].find(R.propEq('family', 'IPv4')).address

const currentIp = getIPv4AddressOfInterface('en8')
console.log('Current IP: ', currentIp)

module.exports = {
  allowedOrigins: ['http://localhost:4001', `http://${currentIp}:4001`, 'http://localhost:5001', `http://${currentIp}:5001`],
  port: process.env.PORT || 4000
}
