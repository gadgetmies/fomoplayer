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
  command: 'carts',
  describe: 'Manage carts',
  builder: (y) =>
    y
      .command({
        command: 'list',
        describe: 'List all carts',
        builder: (y) => fieldsOption(y),
        handler: async (a) => {
          const rows = await new FomoPlayerClient().getCarts()
          printTable(rows, a.fields)
        },
      })
      .command({
        command: 'create <name>',
        describe: 'Create a new cart',
        builder: (y) => y.positional('name', { type: 'string', describe: 'Cart name' }),
        handler: async (a) => {
          const cart = await new FomoPlayerClient().createCart(a.name)
          console.log(JSON.stringify(cart, null, 2))
        },
      })
      .command({
        command: 'delete <id>',
        describe: 'Delete a cart',
        builder: (y) => y.positional('id', { type: 'string', describe: 'Cart ID' }),
        handler: async (a) => {
          await new FomoPlayerClient().deleteCart(a.id)
          console.log('Done.')
        },
      })
      .command({
        command: 'tracks',
        describe: 'Manage cart tracks',
        builder: (y) =>
          y
            .command({
              command: 'list <cart-id>',
              describe: 'List tracks in a cart',
              builder: (y) =>
                fieldsOption(
                  y
                    .positional('cart-id', { type: 'string', describe: 'Cart ID' })
                    .option('offset', { type: 'number', describe: 'Pagination offset' })
                    .option('limit', { type: 'number', describe: 'Pagination limit' })
                    .option('store', { type: 'string', describe: 'Filter by store' }),
                ),
              handler: async (a) => {
                const tracks = await new FomoPlayerClient().getCartTracks(a['cart-id'], {
                  offset: a.offset,
                  limit: a.limit,
                  store: a.store,
                })
                printTable(tracks, a.fields)
              },
            })
            .demandCommand(),
      })
      .demandCommand(),
}
