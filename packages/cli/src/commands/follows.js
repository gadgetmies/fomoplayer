'use strict'

const { FomoPlayerClient } = require('../client')
const { printTable } = require('../output')

const fieldsOption = (y) =>
  y.option('fields', {
    type: 'string',
    describe: 'Comma-separated fields to output',
    coerce: (v) => (v ? v.split(',') : undefined),
  })

const makeListCommand = (type, fetchMethod) => ({
  command: 'list',
  describe: `List followed ${type}`,
  builder: (y) => fieldsOption(y),
  handler: async (a) => {
    const rows = await new FomoPlayerClient()[fetchMethod]()
    printTable(rows, a.fields)
  },
})

const makeAddCommand = (type, addMethod) => ({
  command: 'add <url>',
  describe: `Follow a ${type.replace(/s$/, '')} by URL`,
  builder: (y) => y.positional('url', { type: 'string', describe: `URL of the ${type.replace(/s$/, '')} to follow` }),
  handler: async (a) => {
    await new FomoPlayerClient()[addMethod]([{ url: a.url }])
    console.log('Done.')
  },
})

const makeStarCommand = (typeSingular) => ({
  command: 'star <id>',
  describe: `Star a followed ${typeSingular}`,
  builder: (y) => y.positional('id', { type: 'string', describe: `${typeSingular} ID` }),
  handler: async (a) => {
    await new FomoPlayerClient().setFollowStarred(`${typeSingular}s`, a.id, true)
    console.log('Done.')
  },
})

const makeUnstarCommand = (typeSingular) => ({
  command: 'unstar <id>',
  describe: `Unstar a followed ${typeSingular}`,
  builder: (y) => y.positional('id', { type: 'string', describe: `${typeSingular} ID` }),
  handler: async (a) => {
    await new FomoPlayerClient().setFollowStarred(`${typeSingular}s`, a.id, false)
    console.log('Done.')
  },
})

module.exports = {
  command: 'follows',
  describe: 'Manage follows',
  builder: (y) =>
    y
      .command({
        command: 'artists',
        describe: 'Manage artist follows',
        builder: (y) =>
          y
            .command(makeListCommand('artists', 'getArtistFollows'))
            .command(makeAddCommand('artists', 'addArtistFollows'))
            .command(makeStarCommand('artist'))
            .command(makeUnstarCommand('artist'))
            .demandCommand(),
      })
      .command({
        command: 'labels',
        describe: 'Manage label follows',
        builder: (y) =>
          y
            .command(makeListCommand('labels', 'getLabelFollows'))
            .command(makeAddCommand('labels', 'addLabelFollows'))
            .command(makeStarCommand('label'))
            .command(makeUnstarCommand('label'))
            .demandCommand(),
      })
      .command({
        command: 'playlists',
        describe: 'Manage playlist follows',
        builder: (y) =>
          y
            .command(makeListCommand('playlists', 'getPlaylistFollows'))
            .command(makeAddCommand('playlists', 'addPlaylistFollows'))
            .command(makeStarCommand('playlist'))
            .command(makeUnstarCommand('playlist'))
            .demandCommand(),
      })
      .demandCommand(),
}
