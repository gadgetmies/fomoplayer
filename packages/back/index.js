const colorTrace = require('color-stacktrace')
colorTrace.init(Error)

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player'
// const dbMigrate = require('db-migrate').getInstance(true)
// ;(process.env.RESET_DB_ON_INIT ? dbMigrate.reset() : Promise.resolve()).then(() => dbMigrate.up())

const express = require('express')
const passport = require('passport')
const session = require('express-session')
const cors = require('cors')
const pgSession = require('connect-pg-simple')(session)
const bodyParser = require('body-parser')
const morgan = require('morgan')
const compression = require('compression')

const config = require('./config.js')
const passportSetup = require('./passport-setup.js')
const auth = require('./routes/auth.js')
require('./job-scheduling.js')

const app = express()
app.use(compression())
app.use(
  session({
    store: new pgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'meta_session'
    }),
    secret: config.sessionSecret,
    resave: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  })
)

passportSetup()
app.use(passport.initialize())
app.use(passport.session())

morgan('tiny')

app.use(cors({ credentials: true, origin: config.allowedOrigins }))
app.options('*', cors()) // include before other routes

app.use(bodyParser.json({ limit: '50mb', extended: true }))

const ensureAuthenticated = (req, res, next) => {
  return req.isAuthenticated() ? next() : res.status(401).end()
}

app.use('/api/auth', auth)

app.use(
  '/api',
  (req, res, next) => {
    if (req.headers.authorization) {
      passport.authenticate('jwt', function(err, user, info) {
        if (err) {
          console.error('JWT authentication failed', err)
          next(err)
        }
        req.logIn(user, { session: false }, function(err) {
          if (err) {
            return next(err)
          }
          next()
        })
      })(req, res, next)
    } else {
      ensureAuthenticated(req, res, next)
    }
  },
  require('./routes/index.js')
)

app.use(express.static('public'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500)
  res.send('error')
})

app.listen(config.port)
console.log(`Listening on port: ${config.port}`)
