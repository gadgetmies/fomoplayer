const { FRONTEND_URL } = require('fomoplayer_shared').config(process.env.NODE_ENV).config

describe('login', function () {
  it('Opens login', async function (nightwatch) {
    await nightwatch.supertest
      .request('http://localhost:4003')
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpwd' })
      .expect(204)

    nightwatch
      .navigateTo(FRONTEND_URL)
      .waitForElementVisible('[data-test-id=form-login-button]', 1000)
      .click('[data-test-id=form-login-button]')
      .debug()
  })
})
