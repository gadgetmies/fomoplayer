#!/usr/bin/env node
const R = require('ramda')
const { recursivelyFindByRegex } = require('./file-utils.js')
const BPromise = require('bluebird')
const { fork } = require('child_process')
const yargs = require('yargs')

require('colors')

process.NODE_ENV = 'test'

const runTest = (test) => {
  // TODO: implement regex filtering
  const child = fork(test)

  return new BPromise(function (resolve, reject) {
    child.addListener('error', reject)
    child.addListener('exit', resolve)
  })
}

const main = async (path, regex = /\.js/) => {
  const testFiles = recursivelyFindByRegex(require('path').resolve(`${process.cwd()}/${path}`), regex)

  const exitStatuses = []
  await BPromise.mapSeries(testFiles, async (test) => {
    try {
      const code = await runTest(test)
      exitStatuses.push({ test, code })
    } catch (e) {
      console.error(`${test} execution failed!`, e)
      exitStatuses.push({ test, code: -1 })
    }
  })

  const failedTests = R.reject(R.propEq(0, 'code'), exitStatuses)
  if (failedTests.length !== 0) {
    console.error(`${failedTests.length} tests failed:`.red)
    for (const { test } of failedTests) {
      console.error(`• ${test}`.red)
    }
    process.exit(1)
  }

  console.log('All tests passed!'.green)
  process.exit(0)
}

const argv = yargs
  .usage('Usage: $0 <path> [options]')
  .command(
    '$0 <path>',
    'Runs tests in path filtered by regex if given',
    (yargs) => {
      yargs.positional('path', {
        description: 'Path to test files. Searched recursively.',
        type: 'string',
      })
      yargs.option('regex', {
        description: 'Regex to filter files with',
        alias: 'r',
        type: 'string',
      })
      yargs.check((argv) => {
        if (R.isEmpty(argv.regex)) {
          throw new Error('regex option used, but regex string was empty!')
        }
        return true
      })
    },
    async (argv) => {
      return await main(argv.path, argv.regex)
    },
  )
  .help()
  .alias('help', 'h').argv
