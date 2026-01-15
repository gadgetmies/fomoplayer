'use strict'

const migrationConsoleLogRule = require('./eslint-rules/migration-console-log')

module.exports = [
  {
    files: ['migrations/**/*.js'],
    plugins: {
      'custom-migration': {
        rules: {
          'migration-console-log': migrationConsoleLogRule,
        },
      },
    },
    rules: {
      'custom-migration/migration-console-log': 'error',
    },
  },
]

