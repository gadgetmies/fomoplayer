// `--name=value` and bare `--flag` arguments into an object; the rest go to `_`.
module.exports.parseArgs = (argv) => {
  const args = { _: [] }
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/)
    if (match) args[match[1]] = match[2] === undefined ? true : match[2]
    else args._.push(arg)
  }
  return args
}
