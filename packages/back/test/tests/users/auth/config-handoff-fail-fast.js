'use strict'
const assert = require('assert')
const { test } = require('cascade-test')

const { validateAuthConfig } = require('../../../../routes/shared/auth-config-validator')

const PREVIEW_REGEX = /^https:\/\/[a-z]+-pr-\d+\.example\.com$/
const AUTHORITY = 'https://authority.example.com'
const CONSUMER = 'https://consumer.example.com'

test({
  // Authority (apiOrigin === oidcHandoffAuthorityOrigin or AUTH_API_URL unset)
  'authority with handoff issuer enabled and allowlist configured: OK': () => {
    assert.doesNotThrow(() =>
      validateAuthConfig({
        oidcHandoffSecret: 'test-secret',
        apiOrigin: AUTHORITY,
        oidcHandoffAuthorityOrigin: AUTHORITY,
        allowedPreviewOriginRegexes: [PREVIEW_REGEX],
      }),
    )
  },

  'authority with handoff issuer enabled but allowlist empty: throws': () => {
    assert.throws(
      () =>
        validateAuthConfig({
          oidcHandoffSecret: 'test-secret',
          apiOrigin: AUTHORITY,
          oidcHandoffAuthorityOrigin: AUTHORITY,
          allowedPreviewOriginRegexes: [],
        }),
      /ALLOWED_PREVIEW_ORIGIN_REGEX is empty/,
    )
  },

  'authority with handoff issuer enabled but allowlist undefined: throws': () => {
    assert.throws(
      () =>
        validateAuthConfig({
          oidcHandoffSecret: 'test-secret',
          apiOrigin: AUTHORITY,
          oidcHandoffAuthorityOrigin: AUTHORITY,
          allowedPreviewOriginRegexes: undefined,
        }),
      /ALLOWED_PREVIEW_ORIGIN_REGEX is empty/,
    )
  },

  'authority without handoff secret (issuer disabled) and empty allowlist: OK': () => {
    assert.doesNotThrow(() =>
      validateAuthConfig({
        oidcHandoffSecret: undefined,
        apiOrigin: AUTHORITY,
        oidcHandoffAuthorityOrigin: AUTHORITY,
        allowedPreviewOriginRegexes: [],
      }),
    )
  },

  // Consumer (apiOrigin !== oidcHandoffAuthorityOrigin)
  'consumer with secret and matching allowlist: OK': () => {
    assert.doesNotThrow(() =>
      validateAuthConfig({
        oidcHandoffSecret: 'test-secret',
        apiOrigin: CONSUMER,
        oidcHandoffAuthorityOrigin: AUTHORITY,
        allowedPreviewOriginRegexes: [PREVIEW_REGEX],
      }),
    )
  },

  'consumer with secret but empty allowlist: throws (canMintHandoff is true on consumer too)': () => {
    assert.throws(
      () =>
        validateAuthConfig({
          oidcHandoffSecret: 'test-secret',
          apiOrigin: CONSUMER,
          oidcHandoffAuthorityOrigin: AUTHORITY,
          allowedPreviewOriginRegexes: [],
        }),
      /ALLOWED_PREVIEW_ORIGIN_REGEX is empty/,
    )
  },

  'consumer with AUTH_API_URL elsewhere but no secret: throws': () => {
    assert.throws(
      () =>
        validateAuthConfig({
          oidcHandoffSecret: undefined,
          apiOrigin: CONSUMER,
          oidcHandoffAuthorityOrigin: AUTHORITY,
          allowedPreviewOriginRegexes: [],
        }),
      /OIDC_HANDOFF_SECRET is not set/,
    )
  },

  'error message names the consumer apiOrigin and authority origin for debugging': () => {
    try {
      validateAuthConfig({
        oidcHandoffSecret: undefined,
        apiOrigin: CONSUMER,
        oidcHandoffAuthorityOrigin: AUTHORITY,
        allowedPreviewOriginRegexes: [],
      })
      assert.fail('expected throw')
    } catch (e) {
      assert.match(e.message, new RegExp(CONSUMER.replace(/\./g, '\\.')))
      assert.match(e.message, new RegExp(AUTHORITY.replace(/\./g, '\\.')))
    }
  },

  // Edge cases: missing apiOrigin / authority
  'no apiOrigin (parsing failed): does not throw (handoff is disabled regardless)': () => {
    assert.doesNotThrow(() =>
      validateAuthConfig({
        oidcHandoffSecret: 'test-secret',
        apiOrigin: null,
        oidcHandoffAuthorityOrigin: AUTHORITY,
        allowedPreviewOriginRegexes: [],
      }),
    )
  },

  'no oidcHandoffAuthorityOrigin (AUTH_API_URL unset and frontendURL unparseable): does not throw': () => {
    assert.doesNotThrow(() =>
      validateAuthConfig({
        oidcHandoffSecret: undefined,
        apiOrigin: AUTHORITY,
        oidcHandoffAuthorityOrigin: null,
        allowedPreviewOriginRegexes: [],
      }),
    )
  },
})
