const dbConfig = require('../../database.json')
console.log('Initializing db-migrate with config: ', JSON.stringify(dbConfig))

const resolveDbMigrateEnv = () => {
  const env = process.env.NODE_ENV
  if (!env) {
    throw new Error(
      'NODE_ENV must be set when running the test driver. ' +
        'Invoke via the package.json scripts (e.g. `yarn test`, `yarn ci:test`) ' +
        'so NODE_ENV and .env.<env> are loaded; do not run cascade-test directly.',
    )
  }
  const isEnvEntry = (key) => key !== 'defaultEnv' && typeof dbConfig[key] === 'object'
  if (!isEnvEntry(env) || !Object.prototype.hasOwnProperty.call(dbConfig, env)) {
    const available = Object.keys(dbConfig).filter(isEnvEntry).join(', ')
    throw new Error(
      `NODE_ENV=${env} but database.json has no '${env}' entry. Available envs: ${available}.`,
    )
  }
  return env
}

module.exports = {
  initDb: async () => {
    const dbMigrate = require('db-migrate').getInstance(true, {
      config: dbConfig,
      cwd: `${__dirname}/../../`,
      env: resolveDbMigrateEnv(),
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
