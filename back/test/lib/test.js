const R = require('ramda')
const L = require('partial.lenses')
require('colors')

const noop = () => { }

function getCallerFile() {
  var originalFunc = Error.prepareStackTrace;

  var callerfile;
  try {
    var err = new Error();
    var currentfile;

    Error.prepareStackTrace = function (err, stack) { return stack; };

    currentfile = err.stack.shift().getFileName();

    while (err.stack.length) {
      callerfile = err.stack.shift().getFileName();

      if (currentfile !== callerfile) break;
    }
  } catch (e) { }

  Error.prepareStackTrace = originalFunc;

  return callerfile;
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
    style === 'console' ?
      `${'FAIL'.red}: ${error}`: '<span class="fail">FAIL: ${error}s</span>'

  const printPass = (style = 'console') =>
    style === 'console' ?
      'PASS'.green : '<span class="pass">PASS</span>'

  const printName = (name, style = 'console') =>
     style === 'console' ?
       `• ${name.cyan}:\n` : `<span class="test">${name}:</span>\n`

  const printChildren = (children, style = 'console') =>
     style === 'console' ?
       children.join('\n') : `<ul>\n${children.map(c => `<li>${c}</li>\n`).join('')}\n</ul>\n`

  const printStructure = (node, style = 'console', indent = 2) => {
    const indentString = Array(indent).join(' ');
    return `\
${printName(node[0], style)}${
R.is(Array, node[1])
  ? printChildren(node[1].map(n => indentString.concat(printStructure(n, style, indent + 2))), style)
  : node[1].error !== null
    ? indentString.concat(printFail(node[1].error, style))
    : indentString.concat(printPass(style))
}`
  }

  const run = async suite => {
    const { setup = noop, teardown = noop, ...rest } = suite

    let setupResult
    try {
      setupResult = await setup()
    } catch (e) {
      console.error(e)
      return {
        error: `Setup failed with: '${e.toString()}'`
      }
    }

    let result = []
    for (const key of Object.keys(rest)) {
      const restElement = rest[key]

      let singleResult
      try {
        singleResult = R.is(Function, restElement) ? { error: R.defaultTo(null, await restElement(setupResult)) } : await run(restElement)
      } catch (e) {
        singleResult = { error: e.toString() }
      }
      result.push([key, singleResult])
    }

    try {
      await teardown(setupResult)
    } catch (e) {
      console.error(e)
      return {
        error: `Teardown failed with: '${e.toString()}'`
      }
    }

    return [
      ...result
    ]
  }

  const testFile = getCallerFile()
  console.log('Running test suite: ', testFile)
  const result = [testFile].concat([await run(suite)])
  console.log(printStructure(result))
  const errors = L.collect(L.satisfying(R.allPass([R.is(Object), R.has('error'), R.propIs(String, 'error')])), result)
  const exitCode = errors.length === 0 ? 0 : 1
  process.exit(exitCode)
}
