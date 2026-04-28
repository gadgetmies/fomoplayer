'use strict'

const { FomoPlayerClient } = require('../client')

module.exports = [
  {
    command: 'settings',
    describe: 'Manage settings',
    builder: (y) =>
      y
        .command({
          command: 'get',
          describe: 'Get current settings',
          handler: async () => {
            const settings = await new FomoPlayerClient().getSettings()
            console.log(JSON.stringify(settings, null, 2))
          },
        })
        .command({
          command: 'set-email <email>',
          describe: 'Update email address',
          builder: (y) => y.positional('email', { type: 'string', describe: 'New email address' }),
          handler: async (a) => {
            await new FomoPlayerClient().setEmail(a.email)
            console.log('Done.')
          },
        })
        .demandCommand(),
  },
  {
    command: 'score-weights',
    describe: 'Manage score weights',
    builder: (y) =>
      y
        .command({
          command: 'get',
          describe: 'Get current score weights',
          handler: async () => {
            const weights = await new FomoPlayerClient().getScoreWeights()
            console.log(JSON.stringify(weights, null, 2))
          },
        })
        .command({
          command: 'set <json>',
          describe: 'Set score weights',
          builder: (y) => y.positional('json', { type: 'string', describe: 'JSON array of weight objects' }),
          handler: async (a) => {
            const weights = JSON.parse(a.json)
            await new FomoPlayerClient().setScoreWeights(weights)
            console.log('Done.')
          },
        })
        .demandCommand(),
  },
]
