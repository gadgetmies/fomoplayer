'use strict'

// Run with: node --test .github/scripts/railway-watched-paths.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const { compilePattern, isWatched } = require('./railway-watched-paths')

const compile = (patterns) => patterns.map(compilePattern)

test('no patterns watch every path, as Railway does without watch paths', () => {
  assert.strictEqual(isWatched('anything/at/all.js', []), true)
})

test('the last matching pattern decides', () => {
  const patterns = compile(['**', '!/docs/**', '/docs/keep.md'])
  assert.strictEqual(isWatched('docs/other.md', patterns), false)
  assert.strictEqual(isWatched('docs/keep.md', patterns), true)
  assert.strictEqual(isWatched('src/index.js', patterns), true)
})

test('a leading slash anchors the pattern to the repository root', () => {
  const patterns = compile(['**', '!/scripts/**'])
  assert.strictEqual(isWatched('scripts/backlog-sync/index.js', patterns), false)
  assert.strictEqual(isWatched('packages/back/scripts/wait-for-db.js', patterns), true)
})

test('a single star stays within one path segment', () => {
  const patterns = compile(['**', '!/*.md'])
  assert.strictEqual(isWatched('README.md', patterns), false)
  assert.strictEqual(isWatched('packages/back/README.md', patterns), true)
})

test('a pattern without a slash matches the name at any depth', () => {
  const patterns = compile(['**', '!*.md'])
  assert.strictEqual(isWatched('packages/back/README.md', patterns), false)
})
