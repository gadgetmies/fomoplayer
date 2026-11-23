const L = require('partial.lenses')

// The calendar date of `date` in this process's time zone, as YYYY-MM-DD.
// Not toISOString()'s UTC date: the scores compare fixture dates with the
// database's now(), and between local midnight and the UTC offset (00-02/03
// in Helsinki) the UTC date is still yesterday, so "published today" read as
// a day old. Locally the test database runs in the machine's time zone; in
// CI both are UTC.
const localDate = (date) => {
  const d = new Date(date)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10)
}

module.exports = {
  localDate,
  updateDates: (date = Date.now()) =>
    L.modify(
      L.satisfying((v) => typeof v === 'string' && v.match(/\d{4}-\d{2}-\d{2}/) && !isNaN(new Date(v))),
      () => localDate(date),
    ),
}
