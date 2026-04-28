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
  command: 'tracks',
  describe: 'Manage tracks',
  builder: (y) =>
    y
      .command({
        command: 'list',
        describe: 'List new and recent tracks',
        builder: (y) =>
          fieldsOption(
            y
              .option('store', { type: 'string', describe: 'Filter by store' })
              .option('limit', { type: 'number', describe: 'Limit number of new tracks' }),
          ),
        handler: async (a) => {
          const d = await new FomoPlayerClient().getTracks({ store: a.store, limit_new: a.limit })
          printTable([...(d.tracks?.new ?? []), ...(d.tracks?.recent ?? [])], a.fields)
        },
      })
      .command({
        command: 'mark-heard <id>',
        describe: 'Mark a track as heard',
        builder: (y) => y.positional('id', { type: 'string', describe: 'Track ID' }),
        handler: async (a) => {
          const r = await new FomoPlayerClient().markTrackHeard(a.id)
          console.log(`Heard at: ${r.heardAt}`)
        },
      })
      .command({
        command: 'mark-heard-all',
        describe: 'Mark all tracks as heard',
        builder: (y) => y.option('interval', { type: 'string', describe: 'Time interval filter' }),
        handler: async (a) => {
          const r = await new FomoPlayerClient().markAllHeard(true, a.interval)
          console.log(`Marked ${r.count} tracks heard at ${r.heardAt}`)
        },
      })
      .command({
        command: 'undo-heard',
        describe: 'Undo heard marks since a date',
        builder: (y) => y.option('since', { type: 'string', demandOption: true, describe: 'ISO date string' }),
        handler: async (a) => {
          await new FomoPlayerClient().undoHeard(a.since)
          console.log('Done.')
        },
      })
      .demandCommand(),
}
