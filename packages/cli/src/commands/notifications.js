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
  command: 'notifications',
  describe: 'Manage notifications',
  builder: (y) =>
    y
      .command({
        command: 'list',
        describe: 'List notifications',
        builder: (y) => fieldsOption(y),
        handler: async (a) => {
          const rows = await new FomoPlayerClient().getNotifications()
          printTable(rows, a.fields)
        },
      })
      .command({
        command: 'search',
        describe: 'Manage search notifications',
        builder: (y) =>
          y
            .command({
              command: 'list',
              describe: 'List search notifications',
              builder: (y) => fieldsOption(y),
              handler: async (a) => {
                const rows = await new FomoPlayerClient().getSearchNotifications()
                printTable(rows, a.fields)
              },
            })
            .command({
              command: 'add <string>',
              describe: 'Add a search notification',
              builder: (y) =>
                y
                  .positional('string', { type: 'string', describe: 'Search string to notify on' })
                  .option('store', { type: 'string', describe: 'Store to monitor' }),
              handler: async (a) => {
                await new FomoPlayerClient().addSearchNotification(a.string, a.store)
                console.log('Done.')
              },
            })
            .command({
              command: 'remove <id>',
              describe: 'Remove a search notification',
              builder: (y) => y.positional('id', { type: 'string', describe: 'Notification ID' }),
              handler: async (a) => {
                await new FomoPlayerClient().removeSearchNotification(a.id)
                console.log('Done.')
              },
            })
            .demandCommand(),
      })
      .demandCommand(),
}
