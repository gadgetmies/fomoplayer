module.exports = {
  // Define ip to enable access on local network
  IP: undefined,
  API_PORT: process.env.API_PORT || process.env.REACT_APP_API_PORT || 4003,
  API_URL: process.env.API_URL || process.env.REACT_APP_API_URL || undefined,
  FRONTEND_PORT: process.env.FRONTEND_PORT || process.env.REACT_APP_FRONTEND_PORT || 4004,
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.REACT_APP_FRONTEND_URL || undefined
}
