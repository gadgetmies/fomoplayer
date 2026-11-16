#!/usr/bin/env node
'use strict'

// Tells which changed files would start a Railway deployment of the app
// service, using the `build.watchPatterns` in the repository's railway.json.
//
// Usage: git diff --name-only A B | node railway-watched-paths.js [railway.json]
//
// Prints the watched paths, one per line, and always exits 0 when it could
// decide. An empty output means a push of those changes is skipped by Railway,
// so the preview keeps serving the earlier commit.
//
// The patterns are gitignore-style, as Railway reads them: the last pattern
// that matches a path decides, a leading `!` excludes, a leading `/` anchors
// the pattern to the repository root, `**` spans directories and `*` stays
// within one path segment. A pattern without a `/` before its end matches the
// file name at any depth.

const fs = require('fs')
const path = require('path')

const escapeRegex = (text) => text.replace(/[.+^${}()|[\]\\]/g, '\\$&')

const globToRegex = (glob) => {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') {
        i++
        source += '(?:.*/)?'
      } else {
        source += '.*'
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegex(char)
    }
  }
  return source
}

const compilePattern = (raw) => {
  const negated = raw.startsWith('!')
  let glob = negated ? raw.slice(1) : raw
  const anchored = glob.startsWith('/') || glob.slice(0, -1).includes('/')
  glob = glob.replace(/^\//, '')
  const directoryOnly = glob.endsWith('/')
  if (directoryOnly) glob = `${glob}**`
  const prefix = anchored ? '^' : '^(?:.*/)?'
  // A pattern naming a directory also covers everything below it.
  return { negated, regex: new RegExp(`${prefix}${globToRegex(glob)}(?:/.*)?$`) }
}

const isWatched = (filePath, patterns) => {
  const normalised = filePath.replace(/^\//, '')
  let watched = patterns.length === 0
  for (const { negated, regex } of patterns) {
    if (regex.test(normalised)) watched = !negated
  }
  return watched
}

const loadPatterns = (railwayJsonPath) => {
  const config = JSON.parse(fs.readFileSync(railwayJsonPath, 'utf8'))
  return (config.build?.watchPatterns ?? []).map(compilePattern)
}

module.exports = { compilePattern, isWatched, loadPatterns }

if (require.main === module) {
  const railwayJson = process.argv[2] ?? path.resolve(__dirname, '../../railway.json')
  const patterns = loadPatterns(railwayJson)
  const files = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean)
  for (const file of files) {
    if (isWatched(file, patterns)) console.log(file)
  }
}
