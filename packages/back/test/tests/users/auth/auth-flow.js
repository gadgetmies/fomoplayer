const assert = require('assert')
const { test } = require('cascade-test')
const { isAllowedReturnUrl, evaluateSignUpPolicy, isGoogleSubAllowed } = require('../../../../routes/shared/auth-flow')

test({
  'isAllowedReturnUrl validates allow-list and regex rules': async () => {
    const allowed = isAllowedReturnUrl(
      'https://preview-123.example.com/path',
      ['https://prod.example.com'],
      [/^https:\/\/preview-[a-z0-9-]+\.example\.com$/],
    )
    const denied = isAllowedReturnUrl(
      'https://malicious.example.net/path',
      ['https://prod.example.com'],
      [/^https:\/\/preview-[a-z0-9-]+\.example\.com$/],
    )
    assert.strictEqual(allowed, true)
    assert.strictEqual(denied, false)
  },

  'evaluateSignUpPolicy accepts valid invite when signup closed': async () => {
    const signUpPolicy = await evaluateSignUpPolicy({
      inviteCode: 'invite-123',
      queryAccountCount: async () => 101,
      maxAccountCount: 100,
      deleteInviteCode: async () => 1,
    })
    assert.deepStrictEqual(signUpPolicy, { allowed: true })
  },

  'evaluateSignUpPolicy rejects missing invite when signup closed': async () => {
    const signUpPolicy = await evaluateSignUpPolicy({
      inviteCode: undefined,
      queryAccountCount: async () => 101,
      maxAccountCount: 100,
      deleteInviteCode: async () => 0,
    })
    assert.deepStrictEqual(signUpPolicy, { allowed: false, error: 'sign_up_not_available' })
  },

  'isGoogleSubAllowed allows non-preview environments': async () => {
    const allowed = isGoogleSubAllowed({
      isPreviewEnv: false,
      previewAllowedGoogleSubs: [],
      googleSub: 'any-sub',
    })
    assert.strictEqual(allowed, true)
  },

  'isGoogleSubAllowed denies preview users not in allowlist': async () => {
    const denied = isGoogleSubAllowed({
      isPreviewEnv: true,
      previewAllowedGoogleSubs: ['allowed-sub'],
      googleSub: 'other-sub',
    })
    assert.strictEqual(denied, false)
  },
})

