'use strict'

const { FomoPlayerClient } = require('../client')
const { printTable } = require('../output')

const fieldsOption = (y) =>
  y.option('fields', {
    type: 'string',
    describe: 'Comma-separated fields to output',
    coerce: (v) => (v ? v.split(',') : undefined),
  })

module.exports = {
  command: 'keys',
  describe: 'Manage API keys',
  builder: (y) =>
    y
      .command({
        command: 'list',
        describe: 'List API keys',
        builder: (y) => fieldsOption(y),
        handler: async (a) => {
          const rows = await new FomoPlayerClient().listApiKeys()
          printTable(rows, a.fields)
        },
      })
      .command({
        command: 'revoke <id>',
        describe: 'Revoke an API key',
        builder: (y) => y.positional('id', { type: 'string', describe: 'API key ID' }),
        handler: async (a) => {
          await new FomoPlayerClient().revokeApiKey(a.id)
          console.log('Done.')
        },
      })
      .demandCommand(),
}
