#!/usr/bin/env node
'use strict'

// Post-build helper: upload front-end source maps to Sentry so production
// stack traces resolve to original source. Requires:
//   - SENTRY_AUTH_TOKEN  (project releases scope)
//   - SENTRY_ORG         (Sentry org slug)
//   - SENTRY_PROJECT     (Sentry project slug)
//
// Uses the same release identifier the front-end runtime tags events with
// (set via REACT_APP_SENTRY_RELEASE during `yarn build`). Falls back to
// `front@<git-sha>` so a stand-alone invocation still resolves.
//
// No-op (exit 0) when SENTRY_AUTH_TOKEN is unset, so local builds don't fail
// when the operator hasn't configured Sentry credentials.

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const log = (...args) => console.log('[upload-sourcemaps]', ...args)
const die = (msg) => {
  console.error('[upload-sourcemaps] ' + msg)
  process.exit(1)
}

if (!process.env.SENTRY_AUTH_TOKEN) {
  log('SENTRY_AUTH_TOKEN not set — skipping source-map upload')
  process.exit(0)
}

const org = process.env.SENTRY_ORG
const project = process.env.SENTRY_PROJECT
if (!org || !project) die('SENTRY_ORG and SENTRY_PROJECT must be set when SENTRY_AUTH_TOKEN is')

const buildDir = path.resolve(__dirname, '..', 'build')
if (!fs.existsSync(buildDir)) die(`Build directory not found at ${buildDir} — run \`yarn build\` first`)

const resolveRelease = () => {
  if (process.env.REACT_APP_SENTRY_RELEASE) return process.env.REACT_APP_SENTRY_RELEASE
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    return `front@${sha}`
  } catch (_) {
    die('Could not resolve release: set REACT_APP_SENTRY_RELEASE or run inside a git checkout')
  }
}

const release = resolveRelease()
log(`Uploading source maps for release ${release}`)

const run = (args) => {
  try {
    execFileSync('npx', ['--yes', '@sentry/cli', ...args], {
      stdio: 'inherit',
      env: process.env,
    })
  } catch (e) {
    die(`sentry-cli ${args.join(' ')} failed`)
  }
}

run(['releases', '--org', org, '--project', project, 'new', release])
run([
  'releases',
  '--org',
  org,
  '--project',
  project,
  'files',
  release,
  'upload-sourcemaps',
  buildDir,
  '--rewrite',
  '--validate',
])
run(['releases', '--org', org, '--project', project, 'finalize', release])
log('Done')
