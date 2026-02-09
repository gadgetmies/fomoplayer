const interceptor = require('./interceptor.js')

module.exports.init = () => {
  return interceptor.init({
    proxies: [],
    mocks: [],
    name: 'GoogleOAuth',
    regex: /google-oauth-dummy-regex/,
  })
}
