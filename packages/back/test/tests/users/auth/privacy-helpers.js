const assert = require('assert')
const { test } = require('cascade-test')

const { maskIp, hashSub } = require('../../../../routes/shared/privacy.js')

test({
  'maskIp — IPv4 masks last octet': () => {
    assert.strictEqual(maskIp('1.2.3.4'), '1.2.3.0')
  },

  'maskIp — IPv4 preserves first three octets': () => {
    assert.strictEqual(maskIp('192.168.100.255'), '192.168.100.0')
  },

  'maskIp — IPv4-mapped IPv6 masks IPv4 host part': () => {
    assert.strictEqual(maskIp('::ffff:1.2.3.4'), '::ffff:1.2.3.0')
  },

  'maskIp — IPv4-mapped IPv6 upper case prefix masks IPv4 host part': () => {
    // The implementation matches case-insensitively but always emits the prefix as lowercase ::ffff:
    assert.strictEqual(maskIp('::FFFF:10.20.30.40'), '::ffff:10.20.30.0')
  },

  'maskIp — full IPv6 address keeps first three groups and zeros the rest': () => {
    assert.strictEqual(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), '2001:0db8:85a3::')
  },

  'maskIp — IPv6 with :: notation expands and keeps first three groups': () => {
    assert.strictEqual(maskIp('2001:db8::1'), '2001:0db8:0000::')
  },

  'maskIp — IPv6 localhost ::1 produces zeroed first three groups': () => {
    assert.strictEqual(maskIp('::1'), '0000:0000:0000::')
  },

  'maskIp — null returns unknown': () => {
    assert.strictEqual(maskIp(null), 'unknown')
  },

  'maskIp — empty string returns unknown': () => {
    assert.strictEqual(maskIp(''), 'unknown')
  },

  'maskIp — non-string number returns unknown': () => {
    assert.strictEqual(maskIp(123), 'unknown')
  },

  'hashSub — returns a 16-character lowercase hex string': () => {
    const result = hashSub('user-sub-123')
    assert.strictEqual(result.length, 16, `Expected length 16, got ${result.length}`)
    assert.match(result, /^[0-9a-f]{16}$/, `Expected hex string, got: ${result}`)
  },

  'hashSub — same input always produces the same output': () => {
    assert.strictEqual(hashSub('abc'), hashSub('abc'))
  },

  'hashSub — different inputs produce different outputs': () => {
    assert.notStrictEqual(hashSub('a'), hashSub('b'))
  },

  'hashSub — null returns unknown': () => {
    assert.strictEqual(hashSub(null), 'unknown')
  },

  'hashSub — empty string returns unknown': () => {
    assert.strictEqual(hashSub(''), 'unknown')
  },
})
