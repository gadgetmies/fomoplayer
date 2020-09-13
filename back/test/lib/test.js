const R = require('ramda')

const noop = () => {}

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

  const printStructure = node => {
    return !R.is(Array)(node)
      ? `<li>${JSON.stringify(node)}</li>`
      : R.anyPass([R.isNil, R.isEmpty])(node[1])
        ? `<li>${node[0]}</li>`
        : `<li>${node[0]}<ul>${R.map(printStructure, node[1]).join('')}</ul></li>`
  }

  const run = async suite => {
    const { setup = noop, teardown = noop, ...rest } = suite

    let setupResult
    try {
      setupResult = await setup()
    } catch (e) {
      console.log(e)
      return {
        setupError: e
      }
    }

    let result = []
    for (const key of Object.keys(rest)) {
      const restElement = rest[key]

      let singleResult
      try {
        singleResult = R.is(Function, restElement) ? [await restElement(setupResult)] : await run(restElement)
      } catch (e) {
        singleResult = { error: e.toString() }
      }
      result.push([key, singleResult])
    }

    let teardownError
    try {
      await teardown(setupResult)
    } catch (e) {
      teardownError = e
    }

    return [
      ...result
    ]
  }

  const descriptions = ['root', collectDescriptions(suite)]
  const result = await run(suite)
  console.log(JSON.stringify(['root', result], null, 2))
  console.log(printStructure(['root', result]))
}
