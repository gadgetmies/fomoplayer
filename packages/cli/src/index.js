#!/usr/bin/env node
'use strict'

// Sentry first so unhandled errors during CLI bootstrap are captured.
require('./sentry').init()

const yargs = require('yargs')
const { hideBin } = require('yargs/helpers')
const open = require('open')
const { login } = require('./auth')
const { setApiKey, getApiUrl } = require('./config')

const addCommands = (y, cmds) => [].concat(cmds).reduce((acc, cmd) => acc.command(cmd), y)

let cli = yargs(hideBin(process.argv))
  .command({
    command: 'login',
    describe: 'Log in to fomoplayer',
    handler: async () => {
      const { key } = await login(getApiUrl(), (url) => open(url))
      setApiKey(key)
      console.log('Logged in successfully.')
    },
  })
  .command({
    // Sentry instrumentation smoke test. Captures a synthetic error so the
    // operator can verify a real event reaches Sentry tagged `runtime: cli`.
    command: 'sentry-test',
    describe: false,
    handler: async () => {
      const Sentry = (() => {
        try { return require('@sentry/node') } catch (_) { return null }
      })()
      const { flush } = require('./sentry')
      const err = new Error('sentry-test (cli): synthetic error for instrumentation verification')
      if (Sentry) Sentry.captureException(err)
      await flush(2000)
      console.error(err.message)
      process.exit(1)
    },
  })
  .command(require('./commands/tracks'))
  .command(require('./commands/follows'))
  .command(require('./commands/carts'))
  .command(require('./commands/ignores'))
  .command(require('./commands/notifications'))

cli = addCommands(cli, require('./commands/settings'))

cli = cli.command(require('./commands/api-keys'))

cli = addCommands(cli, require('./commands/query'))

cli
  .command(require('./commands/search'))
  .demandCommand()
  .help()
  .argv
