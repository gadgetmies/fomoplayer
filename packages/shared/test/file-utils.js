const fs = require('fs')
const path = require('path')

const recursivelyFindByRegex = (base, regex, files, result) => {
  files = files || fs.readdirSync(base)
  result = result || []

  files.forEach(function (file) {
    var newbase = path.join(base, file)
    if (fs.statSync(newbase).isDirectory()) {
      result = recursivelyFindByRegex(newbase, regex, fs.readdirSync(newbase), result)
    } else {
      if (file.match(regex)) {
        result.push(newbase)
      }
    }
  })
  return result
}

module.exports = { recursivelyFindByRegex }
