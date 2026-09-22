const assert = require('assert')
const { test } = require('cascade-test')

const {
  renderLayout,
  renderVerification,
  renderInvite,
  renderNotification,
} = require('../../../services/email-templates')

const UNSUB = 'https://api.example.test/api/email/unsubscribe?token=abc'
const MANAGE = 'https://app.example.test/settings/notifications'

test({
  'email templates': {
    'notification layout carries unsubscribe URL, CTA and preheader': async () => {
      const { contentHtml, category } = renderNotification({
        searchText: 'Boris Brejcha',
        tracks: ['Boris Brejcha - Gravity (Original Mix)', 'ARTBAT - Horizon'],
        searchUrl: 'https://app.example.test/search?q=x',
        fromStores: '(from Beatport)',
      })
      assert.equal(category, 'notification')
      const html = renderLayout(contentHtml, { category, unsubscribeUrl: UNSUB, manageUrl: MANAGE })
      assert.ok(html.includes(UNSUB), 'unsubscribe URL present')
      assert.ok(html.includes(MANAGE), 'manage URL present')
      // App-styled CTA button
      assert.ok(/background:#b40089/.test(html), 'brand background present')
      assert.ok(/border:1px solid #530059/.test(html), 'app button border present')
      assert.ok(/border-radius:4px/.test(html), 'app button radius present')
      // Hidden preheader
      assert.ok(/display:none;max-height:0/.test(html), 'preheader present')
      // Track listed
      assert.ok(html.includes('Boris Brejcha - Gravity (Original Mix)'))
    },

    'invite layout carries unsubscribe URL': async () => {
      const { contentHtml, category } = renderInvite({ inviteUrl: 'https://app.example.test/login?invite_code=x' })
      assert.equal(category, 'invite')
      const html = renderLayout(contentHtml, { category, unsubscribeUrl: UNSUB })
      assert.ok(html.includes(UNSUB), 'invite unsubscribe URL present')
    },

    'verification layout omits unsubscribe and includes ignore guidance': async () => {
      const { contentHtml, category, text } = renderVerification({
        verificationUrl: 'https://api.example.test/api/verify-email/code',
      })
      assert.equal(category, 'verification')
      const html = renderLayout(contentHtml, { category })
      assert.ok(!html.includes('/email/unsubscribe'), 'no unsubscribe link on verification')
      assert.ok(/ignore this email/i.test(html), 'ignore guidance present in html')
      assert.ok(/ignore this email/i.test(text), 'ignore guidance present in text')
      assert.ok(/background:#b40089/.test(html), 'branded CTA present')
    },

    'inline styles only — no <style> blocks': async () => {
      const { contentHtml, category } = renderNotification({
        searchText: 'x',
        tracks: ['A - B'],
        searchUrl: 'https://app.example.test/s',
        fromStores: '',
      })
      const html = renderLayout(contentHtml, { category, unsubscribeUrl: UNSUB })
      assert.ok(!/<style/i.test(html), 'no <style> blocks')
    },

    'escapes HTML in caller-supplied content': async () => {
      const { contentHtml, category } = renderNotification({
        searchText: '<script>alert(1)</script>',
        tracks: ['<b>evil</b> - x'],
        searchUrl: 'https://app.example.test/s',
        fromStores: '',
      })
      const html = renderLayout(contentHtml, { category, unsubscribeUrl: UNSUB })
      assert.ok(!html.includes('<script>alert(1)</script>'), 'search text escaped')
      assert.ok(html.includes('&lt;script&gt;'), 'search text HTML-escaped')
    },
  },
})
