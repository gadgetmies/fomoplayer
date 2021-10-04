const colorTrace = require('color-stacktrace')
colorTrace.init(Error)
const config = require('./config.js')

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player'
const pg = require('./db/pg')

const express = require('express')
const passport = require('passport')
const session = require('express-session')
const cors = require('cors')
const pgSession = require('connect-pg-simple')(session)
const bodyParser = require('body-parser')
const morgan = require('morgan')
const compression = require('compression')
const path = require('path')

const passportSetup = require('./passport-setup.js')
const auth = require('./routes/auth.js')
const { HttpError } = require('./routes/shared/httpErrors')
const logger = require('./logger')(__filename)

const app = express()
app.use(compression())
app.use(
  session({
    store: new pgSession({
      pool: pg.pool,
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

app.use(bodyParser.json({ limit: '50mb', extended: true, type: ['application/json', 'application/*+json'] }))

const ensureAuthenticated = (req, res, next) => {
  return req.isAuthenticated() ? next() : res.status(401).end()
}

app.use('/api/auth', auth)

const authenticateJwt = passport.authenticate('jwt', { session: false })

app.use('/api', require('./routes/public.js'))

app.use(
  '/api',
  (req, res, next) => {
    try {
      if (req.headers.authorization) {
        authenticateJwt(req, res, next)
      } else {
        ensureAuthenticated(req, res, next)
      }
    } catch (e) {
      logger.error(e)
      next(e)
    }
  },
  require('./routes/index.js')
)

app.use(express.static('public'))
app.get('/*', (req, res) => res.sendFile(path.join(__dirname + '/public/index.html')))

const handleErrors = (err, req, res, next) => {
  logger.error(err)
  if (err instanceof HttpError) {
    return res.status(err.getCode()).json({
      status: 'error',
      message: err.message
    })
  }

  return res.status(500).json({
    status: 'error',
    message: err.message
  })
}

app.use(handleErrors)

app.listen(config.port)
logger.info(`Listening on port: ${config.port}`)

require('./job-scheduling.js').init()
