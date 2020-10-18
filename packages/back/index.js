const colorTrace = require('color-stacktrace')
colorTrace.init(Error)

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

const dbMigrate = require('db-migrate').getInstance(true)
;(process.env.RESET_DB_ON_INIT ? dbMigrate.reset() : Promise.resolve()).then(() => dbMigrate.up())

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

const ensureAuthenticated = (req, res, next) => (req.isAuthenticated() ? next() : res.status(401).end())

app.use('/api/auth', auth)

// TODO: How to use the jwt on /api/tracks POST handler without blocking other API calls?
const trackHandler = require('./routes/tracks.js')
app.post(/\/api\/tracks$/, passport.authenticate('jwt', { session: false }), trackHandler('new'))
app.post(/\/api\/purchased$/, passport.authenticate('jwt', { session: false }), trackHandler('purchased'))

app.use('/api', ensureAuthenticated, require('./routes/index.js'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500)
  res.send('error')
})

app.listen(config.port)
console.log(`Listening on port: ${config.port}`)
