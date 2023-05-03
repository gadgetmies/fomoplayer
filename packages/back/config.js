const nodeEnv = process.env.NODE_ENV || 'development'
//require('dotenv').config({ path: `.env.${nodeEnv}` })

//const resolveServiceURL = require('../shared/resolveServiceURL.js')
const sharedConfig = {
  API_PORT: process.env.PORT,
  FRONTEND_URL: 'https://d3lojmgbaazgkr.cloudfront.net',
  API_URL: 'http://backs-fomop-ntxv1350b6v3-1616753071.eu-north-1.elb.amazonaws.com:3000'
}
// require('multi-store-player-shared-config')(nodeEnv).config

const port = sharedConfig.API_PORT
const frontendURL = 'https://d3lojmgbaazgkr.cloudfront.net' //resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = 'http://backs-fomop-ntxv1350b6v3-1616753071.eu-north-1.elb.amazonaws.com:3000' //resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')

module.exports = {
  allowedOrigins: [frontendURL, 'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn'],
  port,
  apiURL,
  frontendURL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET
}
