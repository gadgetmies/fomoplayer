'use strict'

const { FomoPlayerClient } = require('../client')
const { printTable } = require('../output')

const fieldsOption = (y) =>
  y.option('fields', {
    type: 'string',
    describe: 'Comma-separated fields to output',
    coerce: (v) => (v ? v.split(',') : undefined),
  })

module.exports = [
  {
    command: 'query <sql>',
    describe: 'Execute a raw SQL query',
    builder: (y) =>
      fieldsOption(
        y
          .positional('sql', { type: 'string', describe: 'SQL query to execute' })
          .option('schema', { type: 'boolean', describe: 'Show DB schema instead of executing a query' }),
      ),
    handler: async (a) => {
      if (a.schema) {
        const schema = await new FomoPlayerClient().getSchema()
        console.log(JSON.stringify(schema, null, 2))
        return
      }
      const result = await new FomoPlayerClient().executeQuery(a.sql)
      if (result.truncated) {
        process.stderr.write('Warning: results were truncated\n')
      }
      printTable(result.rows, a.fields)
    },
  },
  {
    command: 'schema',
    describe: 'Show the database schema',
    handler: async () => {
      const schema = await new FomoPlayerClient().getSchema()
      console.log(JSON.stringify(schema, null, 2))
    },
  },
]
