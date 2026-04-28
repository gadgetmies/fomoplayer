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
  command: 'search <type> <query>',
  describe: 'Search tracks, artists, or labels',
  builder: (y) =>
    fieldsOption(
      y
        .positional('type', {
          type: 'string',
          describe: 'Type to search: tracks, artists, or labels',
          choices: ['tracks', 'artists', 'labels'],
        })
        .positional('query', { type: 'string', describe: 'Search query' }),
    ),
  handler: async (a) => {
    const rows = await new FomoPlayerClient().search(a.type, a.query)
    printTable(rows, a.fields)
  },
}
