const { test: testDbConfig } = require(`../../database.json`)
console.log('Initializing database connection with config: ', testDbConfig)

module.exports = {
  initDb: async () => {
    const dbMigrate = require('db-migrate').getInstance(true, { testDbConfig, cwd: `${__dirname}/../../` })
    dbMigrate.silence(true)
    console.log('Resetting database')
    await dbMigrate.reset()
    console.log('Initializing database')
    await dbMigrate.up()
    console.log('Database initialization done')
  },
  pg: require('pg-using-bluebird')(testDbConfig)
}
