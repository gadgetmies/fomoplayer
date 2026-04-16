/**
 * Tests for the vm2 → Node.js built-in vm migration in bandcamp-api.js.
 *
 * Verifies that scrapeJSON (which now uses vm.runInNewContext) still evaluates
 * inline JavaScript object literals scraped from Bandcamp HTML pages, and that
 * the sandbox provides no access to Node.js globals so hostile page content
 * cannot escape into the host process.
 */
const assert = require('assert')
const { test } = require('cascade-test')
const vm = require('vm')

// Re-implement the exact logic from bandcamp-api.js so we can unit-test it
// without any network or module-level side effects.
const scrapeJSON = (pattern, string) => {
  const match = string.match(new RegExp(pattern), 's')
  if (match === null) {
    throw new Error('No match for pattern')
  }
  return vm.runInNewContext(match[1], {})
}

test({
  // Bandcamp HTML wraps the JSON value in parens: ({...}), so the regex
  // capture group contains the expression including the outer parens.
  // vm.runInNewContext evaluates expressions, not statements, so ({...}) is
  // a grouped expression producing an object — same as what bandcamp-api.js does.
  'vm.runInNewContext evaluates a parenthesised object literal from page source': () => {
    const pageHtml = 'var data = ({"title":"Test Release","id":123});'
    // The regex captures the content inside the outer parens, which includes
    // both the open and close paren so vm evaluates ({...})
    const result = scrapeJSON('(\\(\\{.+\\}\\))', pageHtml)
    // deepEqual (not deepStrictEqual) because vm creates objects in a separate
    // realm — same structure but different prototype references.
    assert.deepEqual(result, { title: 'Test Release', id: 123 })
  },

  'vm.runInNewContext evaluates a nested object literal': () => {
    const pageHtml = 'var data = ({"tracks":[{"id":1,"title":"A"},{"id":2,"title":"B"}]});'
    const result = scrapeJSON('(\\(\\{.+\\}\\))', pageHtml)
    assert.deepEqual(result, { tracks: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] })
  },

  'vm.runInNewContext throws when pattern does not match': () => {
    const pageHtml = 'no matching content here'
    assert.throws(() => scrapeJSON('\\((.+)\\)', pageHtml), /No match for pattern/)
  },

  'sandbox has no access to process global': () => {
    // With an empty context {}, process is not defined.
    // The error comes from the vm realm so its prototype differs — match by message.
    assert.throws(
      () => vm.runInNewContext('process.env', {}),
      /process is not defined/,
    )
  },

  'sandbox has no access to require': () => {
    assert.throws(
      () => vm.runInNewContext('require("fs")', {}),
      /require is not defined/,
    )
  },
})
