const config = require(`./database.json`)
process.env.NODE_ENV = 'test'
const env = require('../../env.js')

module.exports = {
  initDb: async () => {
    console.log('Using db-migrate config', config)
    const dbMigrate = require('db-migrate').getInstance(true, { config, cwd: `${__dirname}/../../` })
    dbMigrate.silence(true)
    await dbMigrate.reset()
    await dbMigrate.up()
  },
  pg: require('pg-using-bluebird')(env)
}
