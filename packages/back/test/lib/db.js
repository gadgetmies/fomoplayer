const dbConfig = require('../../database.json')
console.log('Initializing db-migrate with config: ', JSON.stringify(dbConfig))

module.exports = {
  initDb: async () => {
    const dbMigrate = require('db-migrate').getInstance(true, {
      config: dbConfig,
      cwd: `${__dirname}/../../`,
      env: process.env.NODE_ENV || 'dev',
    })
    dbMigrate.silence(true)
    console.log('Resetting database')
    await dbMigrate.reset()
    console.log('Initializing database')
    await dbMigrate.up()
    console.log('Database initialization done')
  },
  pg: require('pg-using-bluebird')({
    dbUrl: process.env.DATABASE_URL,
    statementTimeout: process.env.STATEMENT_TIMEOUT,
  }),
}
