module.exports = {
  IP: undefined,
  API_PORT: process.env.PORT || process.env.API_PORT || process.env.REACT_APP_API_PORT,
  API_URL: process.env.API_URL || process.env.REACT_APP_API_URL,
  FRONTEND_PORT: process.env.FRONTEND_PORT || process.env.REACT_APP_FRONTEND_PORT,
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.REACT_APP_FRONTEND_URL
}
