#!/usr/bin/env node
'use strict'

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
