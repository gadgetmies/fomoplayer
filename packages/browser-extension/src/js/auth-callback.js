import browser from './browser'

const params = new URLSearchParams(window.location.search)
const code = params.get('code')
const state = params.get('state')
const error = params.get('error')
const heading = document.getElementById('auth-callback-heading')
const message = document.getElementById('auth-callback-message')

const finish = async () => {
  try {
    if (error) {
      const response = await browser.runtime.sendMessage({ type: 'auth-callback', error, state })
      heading.textContent = 'Sign-in cancelled'
      message.textContent = error
      return response
    }
    if (!code || !state) {
      heading.textContent = 'Sign-in failed'
      message.textContent = 'Missing code or state in the redirect URL.'
      await browser.runtime.sendMessage({
        type: 'auth-callback',
        error: 'missing_code_or_state',
        state: state || null,
      })
      return
    }
    await browser.runtime.sendMessage({ type: 'auth-callback', code, state })
    heading.textContent = 'Signed in'
    message.textContent = 'You can close this tab.'
    setTimeout(() => window.close(), 500)
  } catch (e) {
    heading.textContent = 'Sign-in failed'
    message.textContent = e?.message || String(e)
  }
}

finish()
