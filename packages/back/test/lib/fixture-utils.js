const L = require('partial.lenses')

module.exports = {
  updateDates: (date = Date.now()) =>
    L.modify(
      L.satisfying(v => typeof v === 'string' && v.match(/\d{4}-\d{2}-\d{2}/) && !isNaN(new Date(v))),
      () => new Date(date).toISOString().substring(0, 10)
    )
}
