const R = require('ramda')
const L = require('partial.lenses')
require('colors')

const DefaultAssertionTimeout = 5000
const DefaultGroupTimeout = 10000

const noop = () => {}
const timeout = timeout => {
  let id
  const promise = new Promise((_, reject) => {
    id = setTimeout(() => {
      reject(`Test timed out after ${timeout}ms`)
    }, timeout)
  })
  return {
    promise,
    cancel: () => clearTimeout(id)
  }
}

function getCallerFile() {
  var originalFunc = Error.prepareStackTrace

  var callerfile
  try {
    var err = new Error()
    var currentfile

    Error.prepareStackTrace = function(err, stack) {
      return stack
    }

    currentfile = err.stack.shift().getFileName()

    while (err.stack.length) {
      callerfile = err.stack.shift().getFileName()

      if (currentfile !== callerfile) break
    }
  } catch (e) {}

  Error.prepareStackTrace = originalFunc

  return callerfile
}

module.exports.test = async suite => {
  const extractFnPaths = node =>
    Object.keys(node).reduce(
      (acc, key) => [
        ...acc,
        ...(R.is(Function, node[key]) ? [[key, node[key]]] : extractFnPaths(node[key]).map(R.prepend(key)))
      ],
      []
    )

  const collectDescriptions = node =>
    Object.keys(node).reduce(
      (acc, key) => [
        ...acc,
        R.allPass([R.is(Object), R.complement(R.is(Function))], node[key])
          ? [key, collectDescriptions(node[key])]
          : [key]
      ],
      []
    )

  const printFail = (error, style = 'console') =>
    style === 'console' ? `${'FAIL'.red}: ${error}` : '<span class="fail">FAIL: ${error}s</span>'

  const printPass = (style = 'console') => (style === 'console' ? 'PASS'.green : '<span class="pass">PASS</span>')

  const printSkip = (style = 'console') => (style === 'console' ? 'SKIP'.yellow : '<span class="pass">SKIP</span>')

  const printName = (name, style = 'console') =>
    style === 'console' ? `• ${name.cyan}:\n` : `<span class="test">${name}:</span>\n`

  const printChildren = (children, style = 'console') =>
    style === 'console' ? children.join('\n') : `<ul>\n${children.map(c => `<li>${c}</li>\n`).join('')}\n</ul>\n`

  const getIndentString = indent => Array(indent).join(' ')
  const printStructure = (node, style = 'console', indent = 2) => {
    const indentString = getIndentString(indent)
    return `\
${printName(node[0], style)}${
      R.is(Array, node[1])
        ? printChildren(
            node[1].map(n => indentString.concat(printStructure(n, style, indent + 2))),
            style
          )
        : node[1].error !== null
        ? indentString.concat(printFail(node[1].error, style))
        : node[1].skipped
        ? indentString.concat(printSkip(style))
        : indentString.concat(printPass(style))
    }`
  }

  const run = async (suite, { skippingReason, indent = 0 } = {}) => {
    try {
      const { setup = noop, teardown = noop, skip = noop, ...rest } = suite

      if (skip !== noop) {
        skippingReason = skippingReason || skip()
      }

      let setupResult
      if (skippingReason === undefined) {
        try {
          setupResult = await setup()
        } catch (e) {
          console.error(e)
          return {
            error: `Setup failed with: '${e.toString()}'`
          }
        }
      }

      let result = []
      for (const key of Object.keys(rest)) {
        console.log(
          `${getIndentString(indent)}• ${key} ${
            skippingReason ? `SKIPPING${skippingReason !== true ? ` (reason: ${skippingReason})` : ''}` : ''
          }`.blue
        )
        const restElement = rest[key]

        let singleResult
        let timeouts = []
        try {
          if (R.is(Function, restElement)) {
            if (skippingReason) {
              singleResult = {
                skipped: skippingReason,
                error: null
              }
            } else {
              const assertionTimeout = timeout(setupResult?.timeout || DefaultAssertionTimeout)
              timeouts.push(assertionTimeout)
              const { cancel, promise: timeoutPromise } = assertionTimeout
              const res = await Promise.race([restElement(setupResult), timeoutPromise])
              singleResult = {
                skipped: false,
                error: R.defaultTo(null, res)
              }
              cancel()
            }
          } else {
            const groupTimeout = timeout(setupResult?.timeout || DefaultGroupTimeout)
            timeouts.push(groupTimeout)
            const { cancel, promise: timeoutPromise } = groupTimeout
            singleResult = await run(restElement, { skippingReason, indent: indent + 2 })
            cancel()
          }
        } catch (e) {
          console.error(`Test '${key}' failed:`.red, e)
          singleResult = { error: e.toString() }
          timeouts.forEach(t => t.cancel())
        }
        result.push([key, singleResult])
      }

      if (!skippingReason) {
        try {
          await teardown(setupResult)
        } catch (e) {
          console.error(e)
          throw new Error(`Teardown failed with: '${e.toString()}'`)
        }
      }

      return result
    } catch (e) {
      console.error(e)
      throw new Error(`Test group execution failed!: '${e.toString()}'`)
    }
  }

  try {
    const testFile = getCallerFile()
    console.log('Running test suite: ', testFile)
    const result = [testFile].concat([await run(suite)])
    console.log(printStructure(result))
    const errors = L.collect(L.satisfying(R.allPass([R.is(Object), R.has('error'), R.propIs(String, 'error')])), result)
    const exitCode = errors.length === 0 ? 0 : 1
    console.log(`Test suite finished ${exitCode === 0 ? 'successfully' : `with ${errors.length} errors`}`)
    process.exit(exitCode)
  } catch (e) {
    console.error(`Test suite exection failed: ${e.toString()}`.red)
    console.error(e)
  }
}
