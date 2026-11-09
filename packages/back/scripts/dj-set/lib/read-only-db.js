// Connects the shared pg pool read-only. The DJ set tools point DATABASE_URL
// at production; they must never write there. Require this module before
// anything that loads `fomoplayer_shared` so the pool picks up the option.

const READ_ONLY_OPTION = '-c default_transaction_read_only=on'

const withReadOnlyOption = (databaseUrl) => {
  const url = new URL(databaseUrl)
  const options = url.searchParams.get('options')
  url.searchParams.set('options', options ? `${options} ${READ_ONLY_OPTION}` : READ_ONLY_OPTION)
  return url.toString()
}

for (const name of ['DATABASE_URL_PRIVATE', 'DATABASE_URL']) {
  if (process.env[name]) process.env[name] = withReadOnlyOption(process.env[name])
}
// The pool sets statement_timeout from this and fails on an unset value.
process.env.STATEMENT_TIMEOUT = process.env.STATEMENT_TIMEOUT || '300s'
if (!process.env.DATABASE_URL_PRIVATE && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must point at the database holding the preview fingerprints')
}

const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

// Refuses to continue unless the session really is read-only.
const assertReadOnly = async () => {
  const [{ default_transaction_read_only: readOnly }] = await pg.queryRowsAsync(sql`SHOW default_transaction_read_only`)
  if (readOnly !== 'on')
    throw new Error(`database session is not read-only (default_transaction_read_only=${readOnly})`)
}

module.exports = { pg, assertReadOnly }
