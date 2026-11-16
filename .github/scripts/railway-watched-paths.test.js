'use strict'

// Run with: node --test .github/scripts/railway-watched-paths.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { compilePattern, isWatched, loadPatterns } = require('./railway-watched-paths')

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

test("the repository's railway.json skips analyser, OpenSpec and tooling changes only", () => {
  const patterns = loadPatterns(path.resolve(__dirname, '../../railway.json'))
  const skipped = [
    'analyser/main.py',
    'openspec/changes/some-change/tasks.md',
    'docs/contributing-workflow.md',
    'backlog/tasks/task-1.md',
    'scripts/backlog-sync/index.js',
    '.github/workflows/node.js.yml',
    '.claude/settings.json',
    '.agents/pipeline.yml',
    'packages/cli/src/index.js',
    'README.md',
    'PREVIEW_DEPLOYMENT.md',
  ]
  const deployed = [
    'Dockerfile',
    'railway.json',
    'package.json',
    'yarn.lock',
    'patches/some-package+1.0.0.patch',
    'packages/back/index.js',
    'packages/back/test/lib/tracks.js',
    'packages/back/scripts/db-migrate-with-retry.js',
    'packages/front/src/App.js',
    'packages/shared/config.js',
    'packages/browser-extension/src/js/transforms/beatport.js',
    'packages/back/README.md',
  ]
  for (const file of skipped) assert.strictEqual(isWatched(file, patterns), false, `${file} should be skipped`)
  for (const file of deployed) assert.strictEqual(isWatched(file, patterns), true, `${file} should deploy`)
})
