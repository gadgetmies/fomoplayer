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
  command: 'ignores',
  describe: 'Manage ignores',
  builder: (y) =>
    y
      .command({
        command: 'artists',
        describe: 'Manage ignored artists',
        builder: (y) =>
          y
            .command({
              command: 'list',
              describe: 'List ignored artists',
              builder: (y) => fieldsOption(y),
              handler: async (a) => {
                const rows = await new FomoPlayerClient().getArtistIgnores()
                printTable(rows, a.fields)
              },
            })
            .command({
              command: 'add <id>',
              describe: 'Ignore an artist',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Artist ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().addArtistIgnore(a.id)
                console.log('Done.')
              },
            })
            .command({
              command: 'remove <id>',
              describe: 'Remove an artist ignore',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Artist ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().removeArtistIgnore(a.id)
                console.log('Done.')
              },
            })
            .demandCommand(),
      })
      .command({
        command: 'labels',
        describe: 'Manage ignored labels',
        builder: (y) =>
          y
            .command({
              command: 'list',
              describe: 'List ignored labels',
              builder: (y) => fieldsOption(y),
              handler: async (a) => {
                const rows = await new FomoPlayerClient().getLabelIgnores()
                printTable(rows, a.fields)
              },
            })
            .command({
              command: 'add <id>',
              describe: 'Ignore a label',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Label ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().addLabelIgnore(a.id)
                console.log('Done.')
              },
            })
            .command({
              command: 'remove <id>',
              describe: 'Remove a label ignore',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Label ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().removeLabelIgnore(a.id)
                console.log('Done.')
              },
            })
            .demandCommand(),
      })
      .command({
        command: 'releases',
        describe: 'Manage ignored releases',
        builder: (y) =>
          y
            .command({
              command: 'add <id>',
              describe: 'Ignore a release',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Release ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().addReleaseIgnore(a.id)
                console.log('Done.')
              },
            })
            .demandCommand(),
      })
      .demandCommand(),
}
