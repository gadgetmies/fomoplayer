#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

const MAX_ATTEMPTS = parseInt(process.env.DB_MIGRATE_MAX_ATTEMPTS || '5', 10)
const INITIAL_BACKOFF_MS = parseInt(process.env.DB_MIGRATE_INITIAL_BACKOFF_MS || '2000', 10)
const MAX_BACKOFF_MS = parseInt(process.env.DB_MIGRATE_MAX_BACKOFF_MS || '15000', 10)

const STARTING_UP_PATTERN = /the database system is starting up/i

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const runMigrate = () =>
  new Promise((resolve) => {
    const configPath = path.join(process.cwd(), 'database.json')
    const env = process.env.NODE_ENV === 'ci' ? 'ci' : 'prod'
    const child = spawn(
      'npx',
      ['db-migrate', '-v', '--config', configPath, '-e', env, 'up'],
      { stdio: ['inherit', 'pipe', 'pipe'] },
    )

    let stdoutBuf = ''
    let stderrBuf = ''
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString()
      stdoutBuf += s
      process.stdout.write(s)
    })
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString()
      stderrBuf += s
      process.stderr.write(s)
    })

    child.on('error', (err) => {
      resolve({ code: 1, output: `${stdoutBuf}\n${stderrBuf}\n${err.message}` })
    })
    child.on('close', (code) => {
      resolve({ code: code == null ? 1 : code, output: `${stdoutBuf}\n${stderrBuf}` })
    })
  })

const main = async () => {
  let backoff = INITIAL_BACKOFF_MS
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`db-migrate-with-retry: attempt ${attempt}/${MAX_ATTEMPTS}`)
    const { code, output } = await runMigrate()
    if (code === 0) {
      console.log('db-migrate-with-retry: migration succeeded')
      return
    }
    if (attempt === MAX_ATTEMPTS || !STARTING_UP_PATTERN.test(output)) {
      console.error(`db-migrate-with-retry: migration failed (exit ${code})`)
      process.exit(code || 1)
    }
    console.warn(
      `db-migrate-with-retry: database is starting up, retrying in ${backoff}ms`,
    )
    await sleep(backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }
}

main().catch((err) => {
  console.error('db-migrate-with-retry: unexpected error', err)
  process.exit(1)
})
