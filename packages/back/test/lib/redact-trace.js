#!/usr/bin/env node
'use strict'

// Scrub secrets from Playwright trace zip(s) in place, so a trace can be
// published for review without leaking credentials.
//
// Usage:
//   node redact-trace.js <dir-or-zip> [<dir-or-zip> ...]
//
// A directory argument is expanded to every *.zip it contains (non-recursive).
//
// What gets redacted across EVERY entry of each trace zip:
//   1. The literal OIDC_TOKEN value (from the OIDC_TOKEN env var), if set. The
//      preview login no longer records the token (tracing starts after login,
//      see setup.js), but this is belt-and-suspenders in case it surfaces in a
//      redirect URL or response body.
//   2. Any session cookie value — `connect.sid=<value>` in Cookie request
//      headers and Set-Cookie response headers — regardless of value, so we do
//      not need to know the server-issued id ahead of time.
//
// Trace zips contain newline-delimited JSON (*.trace / *.network / *.stacks)
// plus binary resource blobs. We read every entry as latin1, which preserves
// bytes 1:1, so the literal/regex replacements scrub ASCII secrets without
// corrupting binary resources. unzip/zip CLIs do the (de)compression — both CI
// runners provide them (ubuntu-latest natively; the node:22 container installs
// them alongside git).

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const REDACTED = 'REDACTED'
// `connect.sid=` followed by the cookie value. The value stops at the first
// delimiter: `;` (cookie/attribute separator), a quote (the header sits inside
// a JSON string in the trace), whitespace, or a backslash (JSON escape). This
// matches both `connect.sid=s%3A...` (URL-encoded) and bare forms, and leaves
// the `connect.sid=` prefix in place so the trace still reads sensibly.
const SESSION_COOKIE_RE = /connect\.sid=[^;"'\s\\]+/g

const collectZips = (target) => {
  let stat
  try {
    stat = fs.statSync(target)
  } catch {
    console.warn(`[redact-trace] Skipping missing path: ${target}`)
    return []
  }
  if (stat.isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((name) => name.toLowerCase().endsWith('.zip'))
      .map((name) => path.join(target, name))
  }
  return target.toLowerCase().endsWith('.zip') ? [target] : []
}

const walkFiles = (dir) => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

const redactContent = (content, literals) => {
  let next = content
  for (const literal of literals) {
    if (next.includes(literal)) {
      next = next.split(literal).join(REDACTED)
    }
  }
  next = next.replace(SESSION_COOKIE_RE, `connect.sid=${REDACTED}`)
  return next
}

const redactZip = (zipPath, literals) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-redact-'))
  try {
    execFileSync('unzip', ['-qq', '-o', zipPath, '-d', tmpDir])

    let redactedFiles = 0
    for (const file of walkFiles(tmpDir)) {
      const original = fs.readFileSync(file, 'latin1')
      const updated = redactContent(original, literals)
      if (updated !== original) {
        fs.writeFileSync(file, updated, 'latin1')
        redactedFiles += 1
      }
    }

    // Rebuild the archive from scratch: `zip` would otherwise merge into the
    // existing file and keep the unredacted entries.
    fs.rmSync(zipPath, { force: true })
    execFileSync('zip', ['-q', '-r', '-X', path.resolve(zipPath), '.'], { cwd: tmpDir })
    console.log(`[redact-trace] Redacted ${redactedFiles} entr${redactedFiles === 1 ? 'y' : 'ies'} in ${zipPath}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

const main = () => {
  const targets = process.argv.slice(2)
  if (targets.length === 0) {
    console.error('Usage: node redact-trace.js <dir-or-zip> [<dir-or-zip> ...]')
    process.exit(1)
  }

  const literals = []
  const oidcToken = process.env.OIDC_TOKEN
  // Guard against redacting trivially short/empty values that would mangle the
  // whole trace.
  if (oidcToken && oidcToken.length >= 8) {
    literals.push(oidcToken)
  }

  const zips = targets.flatMap(collectZips)
  if (zips.length === 0) {
    console.warn('[redact-trace] No trace zips found to redact.')
    return
  }

  for (const zip of zips) {
    redactZip(zip, literals)
  }
}

main()
