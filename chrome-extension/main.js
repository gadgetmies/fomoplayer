document.getElementById('sign-in-button').onclick = async function () {
  //const redirectUrl = chrome.identity.getRedirectURL()
  //console.error(redirectUrl)

  //const res = await fetch('http://localhost:4000/tracks')

  chrome.identity.launchWebAuthFlow(
    { url: 'http://localhost:4000/auth/google', interactive: true },
    function (responseUrl) {
      console.error(responseUrl)
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message)
        return
      }

      console.log(responseUrl)
      var accessTokenStart = responseUrl.indexOf(ACCESS_TOKEN_PREFIX)

      if (!accessTokenStart) {
        console.error('Unexpected responseUrl: ' + responseUrl)
        return
      }

      var accessToken = responseUrl.substring(
        accessTokenStart + ACCESS_TOKEN_PREFIX.length)

      console.lo(accessToken)
    })
}
