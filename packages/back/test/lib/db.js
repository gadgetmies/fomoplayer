const dbConfig = require('../../database.json')
console.log('Initializing db-migrate with config: ', JSON.stringify(dbConfig))

const adminUserSubs = (process.env.ADMIN_USER_SUBS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// The seeded `testuser` logs in via email/password in local/CI browser tests,
// but admin is matched by OIDC subject (ADMIN_USER_SUBS). Give the test user an
// OIDC identity carrying the configured admin subject so the /admin browser
// tests can reach admin views. Test-only: this never runs in deployed envs.
const seedTestUserAdminOidcIdentity = async (pg) => {
  const adminSub = adminUserSubs[0]
  if (!adminSub) return
  await pg.queryAsync(
    `INSERT INTO meta_account__authentication_method_details
       (meta_account_user_id, authentication_method_id, meta_account__authentication_method_details_details)
     SELECT email_identity.meta_account_user_id,
            oidc_method.authentication_method_id,
            jsonb_build_object('issuer', 'accounts.google.com', 'subject', $1)
     FROM meta_account__authentication_method_details email_identity
       JOIN authentication_method email_method
         ON email_method.authentication_method_id = email_identity.authentication_method_id
        AND email_method.authentication_method_code = 'email'
       JOIN authentication_method oidc_method
         ON oidc_method.authentication_method_code = 'oidc'
     WHERE email_identity.meta_account__authentication_method_details_details ->> 'username' = 'testuser'`,
    [adminSub],
  )
}

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

const pg = require('pg-using-bluebird')({
  dbUrl: process.env.DATABASE_URL,
  statementTimeout: process.env.STATEMENT_TIMEOUT,
})

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
    await seedTestUserAdminOidcIdentity(pg)
    console.log('Database initialization done')
  },
  pg,
}
