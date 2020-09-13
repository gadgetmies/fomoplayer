module.exports = {
  initDb: () => {
    const dbMigrate = require('db-migrate').getInstance(true, { config: `${__dirname}/database.json`, cwd: '../../../back' })
    dbMigrate.silence(true) // TODO: why does this not work!?
    const backup = console.log
    console.log = () => {}
    return dbMigrate.reset().then(() => dbMigrate.up())
    .then(() => {
    console.log = backup
    })
  }
}
