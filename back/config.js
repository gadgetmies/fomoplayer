let nodeEnv = process.env.NODE_ENV || 'development'
require('dotenv').config({path: `.env.${nodeEnv}`})

const resolveServiceURL = require('../shared/resolveServiceURL.js')
const sharedConfig = require('shared')(nodeEnv).config

const port = sharedConfig.API_PORT
const interfaceName = sharedConfig.INTERFACE
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, interfaceName, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, interfaceName, port, '/api')

module.exports = {
  allowedOrigins: [
    frontendURL,
    'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn'
  ],
  port,
  apiURL,
  frontendURL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET
}
