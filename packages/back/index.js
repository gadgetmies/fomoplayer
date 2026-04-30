const colorTrace = require('color-stacktrace')
colorTrace.init(Error)
const config = require('./config.js')
const logger = require('fomoplayer_shared').logger(__filename)

logger.info('####################################')
logger.info('####### Starting Fomo Player #######')
logger.info('####################################')

if (!config.cryptoKey || Buffer.byteLength(config.cryptoKey, 'utf8') < 16) {
  logger.error('CRYPTO_KEY must be set and at least 16 bytes — refusing to start')
  process.exit(1)
}

if (process.env.NODE_ENV !== 'production') {
  if (process.env.BEATPORT_REDIRECT || process.env.BEATPORT_MOCK) {
    require('fomoplayer_shared').interceptors.beatport.init()
  }
  if (process.env.BANDCAMP_REDIRECT || process.env.BANDCAMP_MOCK) {
    require('fomoplayer_shared').interceptors.bandcamp.init()
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player'
const pg = require('fomoplayer_shared').db.pg

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
const rateLimit = require('express-rate-limit')

const { ensureAuthenticated } = require('./routes/shared/auth.js')
const passportSetup = require('./passport-setup.js')
const auth = require('./routes/auth.js')
const { HttpError } = require('./routes/shared/httpErrors')
const { logRequestError } = require('./routes/shared/error-logging')
const { getCartDetails } = require('./routes/logic')
const { createCorsOriginValidator } = require('./cors-origin')

const { isPreviewEnv, isDevelopment, isTest } = config
const cookieSecure = isPreviewEnv || (!isDevelopment && !isTest)

const app = express()
app.set('trust proxy', 1)
app.use(morgan('combined'))
app.use(compression())
app.use(
  session({
    store: new pgSession({
      pool: pg.pool,
      tableName: 'meta_session',
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isPreviewEnv ? 'none' : 'lax',
    },
  }),
)

app.use(timeout('25s'))

if (process.env.USE_RATE_LIMITER) {
  logger.debug('Enabling rate limiter')
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
  })
  app.use(limiter)
}

passportSetup()
app.use(passport.initialize())
app.use(passport.session())

const corsOptions = {
  credentials: true,
  origin: createCorsOriginValidator({
    allowedOrigins: config.allowedOrigins,
    allowedOriginRegexes: config.allowedOriginRegexes,
  }),
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions)) // include before other routes

app.use('/api/admin', bodyParser.json({ limit: '20mb', extended: true, type: ['application/json', 'application/*+json'] }))
app.use(bodyParser.json({ limit: '1mb', extended: true, type: ['application/json', 'application/*+json'] }))

app.use((req, res, next) => {
  const val = req.query.store
  req.query.store = val && !Array.isArray(val) ? [val] : val
  next()
})

app.use('/api/auth', auth)

const jwtStrategies = config.internalAuthHandoffJwksUrl && config.internalAuthHandoffIssuer ? ['jwt-internal'] : []
const authenticateJwt = jwtStrategies.length > 0 ? passport.authenticate(jwtStrategies, { session: false }) : undefined

app.use('/api', require('./routes/public.js'))

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/mock/', require('./routes/mock/index.js'))
}

const authenticateApiKey = (req, res, next) =>
  passport.authenticate('api-key', { session: false }, (err, user, info) => {
    if (err) return next(err)
    if (!user) {
      if (info?.rateLimited) {
        res.set('Retry-After', String(info.retryAfter))
        res.set('X-RateLimit-Limit-Minute', String(info.limitPerMinute))
        res.set('X-RateLimit-Remaining-Minute', String(info.remainingMinute))
        res.set('X-RateLimit-Limit-Day', String(info.limitPerDay))
        res.set('X-RateLimit-Remaining-Day', String(info.remainingDay))
        return res.status(429).json({ error: 'Rate limit exceeded' })
      }
      return res.status(401).json({ error: 'Invalid or revoked API key' })
    }
    req.user = user
    next()
  })(req, res, next)

app.use(
  '/api',
  (req, res, next) => {
    try {
      const auth = req.headers.authorization ?? ''
      if (auth.startsWith('Bearer fp_')) return authenticateApiKey(req, res, next)
      if (auth) {
        if (!authenticateJwt) return res.status(401).end()
        return authenticateJwt(req, res, next)
      }
      return ensureAuthenticated(req, res, next)
    } catch (e) {
      logger.error('Error authenticating request', e)
      next(e)
    }
  },
  require('./routes/index.js'),
)

app.use(express.static('public'))

const indexPath = path.resolve(__dirname, 'public/index.html')

const escapeHtmlAttribute = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

app.get('/carts/:uuid', async ({ params: { uuid }, query: { limit, offset, store: stores }, user }, res, next) => {
  if (!uuid) {
    logger.error('Error during file reading', { uuid })
    return res.status(500).end()
  }

  if (!indexFile) {
    return res.status(503).send('Frontend build not available')
  }

  const cartDetails = await getCartDetails(uuid, user?.id, stores, { offset, limit })

  if (cartDetails === null) {
    logger.debug('Cart details not found or cart not public', { uuid })
    return res.status(404).end()
  }

  const sanitizedName = escapeHtmlAttribute(cartDetails.name)

  const cartOpenGraphDetails = cartDetails.tracks
    .map(({ artists, duration, previews, released, title }, index) => {
      const preview = previews.find(R.prop('url'))

      return preview
        ? `
  <meta property='music:song' content='${escapeHtmlAttribute(preview.url)}'>
  <meta property='music:song:disc' content='1'>
  <meta property='music:song:track' content='${index}'>`
        : ''
    })
    .join('\n')

  const patchedIndex = indexFile
    .replace('<title>Player</title>', `<title>Player - ${sanitizedName}</title>`)
    .replace(
      '</head>',
      `<meta property='og:type' content='music.album'>
<meta property='og:description' content='${sanitizedName} · ${cartDetails.tracks.length} songs.'>
<meta property='og:title' content='${sanitizedName}'>
${cartOpenGraphDetails}`,
    )
  return res.send(patchedIndex)
})

const indexFile = (() => {
  try {
    return fs.readFileSync(indexPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn(`SPA index not found at ${indexPath}; SPA routes will respond with 503 until the front-end is built`)
      return null
    }
    throw err
  }
})()
const sendIndex = (_, res) => {
  if (!indexFile) {
    return res.status(503).send('Frontend build not available')
  }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': indexFile.length })
  res.write(indexFile)
  res.end()
}

app.get('/*', sendIndex)

const handleErrors = (err, req, res, _) => {
  logRequestError(logger, err, {
    url: req.url,
    method: req.method,
  })

  if (err instanceof HttpError) {
    return res.status(err.getCode()).json({
      status: 'error',
      message: err.message,
    })
  }

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  })
}

app.use(handleErrors)

app.listen(config.port)
logger.info(`Listening on port: ${config.port}`)

require('./job-scheduling.js').init()
