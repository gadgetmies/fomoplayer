const express = require('express')
const passport = require('passport')
const Strategy = require('passport-local').Strategy
const session = require('express-session')
const cors = require('cors')
const pgSession = require('connect-pg-simple')(session)

const config = require('./config.js')
const account = require('./db/account.js')

const compression = require('compression')

const checkCredentials = (username, password, done) =>
  account
    .authenticate(username, password)
    .then(success => (success ? { username: username } : false))
    .asCallback(done)

const dbMigrate = require('db-migrate').getInstance(true, { config: `${__dirname}/database.json` })
;(process.env.RESET_DB_ON_INIT ? dbMigrate.reset() : Promise.resolve()).then(() => dbMigrate.up())

passport.use(new Strategy(checkCredentials))

passport.serializeUser((userToSerialize, done) => done(null, userToSerialize.username))
passport.deserializeUser((username, done) => account.findByUsername(username).nodeify(done))

const app = express()
app.use(compression())
app.use(
  session({
    store: new pgSession({
      conString: 'postgres://localhost/multi-store-player',
      tableName: 'meta_session' // Use another table-name than the default "session" one
    }),
    secret: 'top secret',
    resave: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  })
)

app.use(passport.initialize())
app.use(passport.session())

app.use(cors({ credentials: true, origin: config.allowedOrigins }))
app.options('*', cors()) // include before other routes

app.use('/', require('./routes/index.js'))
app.use('/stores', require('./routes/stores/index.js'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500)
  res.send('error')
})

app.listen(config.port)
console.log(`Listening on port: ${config.port}`)
