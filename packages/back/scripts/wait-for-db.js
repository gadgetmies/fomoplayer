#!/usr/bin/env node

const { Client } = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('wait-for-db: DATABASE_URL is not set')
  process.exit(1)
}

const ssl = Boolean(process.env.DATABASE_USE_SSL)
  ? { rejectUnauthorized: !Boolean(process.env.DATABASE_SELF_SIGNED_CERT) }
  : false

const TIMEOUT_MS = parseInt(process.env.DB_WAIT_TIMEOUT_MS || '180000', 10)
const ATTEMPT_TIMEOUT_MS = parseInt(process.env.DB_WAIT_ATTEMPT_TIMEOUT_MS || '10000', 10)
const INITIAL_BACKOFF_MS = parseInt(process.env.DB_WAIT_INITIAL_BACKOFF_MS || '1000', 10)
const MAX_BACKOFF_MS = parseInt(process.env.DB_WAIT_MAX_BACKOFF_MS || '8000', 10)

const redactUrl = (url) => {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return '<unparseable url>'
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const tryConnect = async () => {
  const client = new Client({ connectionString, ssl, connectionTimeoutMillis: ATTEMPT_TIMEOUT_MS })
  try {
    await client.connect()
    await client.query('SELECT 1')
  } finally {
    try {
      await client.end()
    } catch {
      // ignore close errors
    }
  }
}

const main = async () => {
  console.log(`wait-for-db: pinging ${redactUrl(connectionString)} (timeout ${TIMEOUT_MS}ms)`)
  const deadline = Date.now() + TIMEOUT_MS
  let attempt = 0
  let backoff = INITIAL_BACKOFF_MS
  let lastError

  while (Date.now() < deadline) {
    attempt += 1
    try {
      await tryConnect()
      console.log(`wait-for-db: database is ready after ${attempt} attempt(s)`)
      return
    } catch (err) {
      lastError = err
      const remaining = deadline - Date.now()
      console.warn(
        `wait-for-db: attempt ${attempt} failed (${err.code || ''} ${err.message}); ` +
          `retrying in ${backoff}ms (${remaining}ms remaining)`,
      )
      if (remaining <= backoff) break
      await sleep(backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }
  }

  console.error(`wait-for-db: gave up after ${attempt} attempt(s): ${lastError && lastError.message}`)
  process.exit(1)
}

main().catch((err) => {
  console.error('wait-for-db: unexpected error', err)
  process.exit(1)
})
