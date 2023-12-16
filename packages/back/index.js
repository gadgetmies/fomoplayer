const colorTrace = require('color-stacktrace')
colorTrace.init(Error)
const config = require('./config.js')
const logger = require('./logger')(__filename)

logger.info('####################################')
logger.info('####### Starting Fomo Player #######')
logger.info('####################################')

if (process.env.NODE_ENV !== 'production') {
  require('./test/lib/spotifyInterceptor').init()
}

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
const fs = require('fs')
const R = require('ramda')
const timeout = require('connect-timeout')

const { ensureAuthenticated } = require('./routes/shared/auth.js')
const passportSetup = require('./passport-setup.js')
const auth = require('./routes/auth.js')
const { HttpError } = require('./routes/shared/httpErrors')
const { getCartDetails } = require('./routes/logic')

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

app.use(timeout('25s'))

passportSetup()
app.use(passport.initialize())
app.use(passport.session())

morgan('tiny')

app.use(cors({ credentials: true, origin: config.allowedOrigins }))
app.options('*', cors()) // include before other routes

app.use(bodyParser.json({ limit: '50mb', extended: true, type: ['application/json', 'application/*+json'] }))

app.use('/api/auth', auth)

const authenticateJwt = passport.authenticate('jwt', { session: false })

app.use('/api', require('./routes/public.js'))

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/mock/', require('./routes/mock/index.js'))
}

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
      logger.error('Error authenticating request', e)
      next(e)
    }
  },
  require('./routes/index.js')
)

app.use(express.static('public'))

const indexPath = path.resolve(__dirname, 'public/index.html')
app.get('/cart/:uuid', ({ params: { uuid } }, res, next) => {
  fs.readFile(indexPath, async (err, index) => {
    try {
      if (err || !uuid) {
        logger.error('Error during file reading', { uuid, err })
        return res.status(500).end()
      }

      const cartDetails = await getCartDetails(uuid)

      if (cartDetails === null) {
        logger.debug('Cart details not found', { uuid })
        return res.status(404).end()
      }

      const cartOpenGraphDetails = cartDetails.tracks
        .map(({ artists, duration, previews, released, title }, index) => {
          const preview = previews.find(R.prop('url'))

          return preview
            ? `
  <meta property='music:song' content='${preview.url}'>
  <meta property='music:song:disc' content='1'>
  <meta property='music:song:track' content='${index}'>`
            : ''
        })
        .join('\n')

      const patchedIndex = index
        .toString()
        .replace('<title>Player</title>', `<title>Player - ${cartDetails.name}</title>`)
        .replace(
          '</head>',
          `<meta property='og:type' content='music.album'>
<meta property='og:description' content='${cartDetails.name} · ${cartDetails.tracks.length} songs.'>
<meta property='og:title' content='${cartDetails.name}'>
${cartOpenGraphDetails}`
        )
      return res.send(patchedIndex)
    } catch (e) {
      logger.error('Cart page generation failed', e)
      next(e)
    }
  })
})

app.get('/*', (req, res) => res.sendFile(path.join(indexPath)))

const handleErrors = (err, req, res, next) => {
  logger.error(err instanceof String ? err : err.toString())
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
