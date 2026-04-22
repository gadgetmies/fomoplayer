const { chromium } = require('playwright')
const fs = require('fs/promises')
const path = require('path')
const { initDb } = require('./db')
const { startServer } = require('./server')

let initPromise = null
const BACKEND_ROOT = path.resolve(__dirname, '../..')
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, '../front')
const FRONTEND_SOURCE_PATHS = ['src', 'public', 'package.json'].map((entry) => path.join(FRONTEND_ROOT, entry))
const FRONTEND_BUILD_PATH = path.join(BACKEND_ROOT, 'public')

const getLatestMtimeMs = async (targetPath) => {
  let stats
  try {
    stats = await fs.stat(targetPath)
  } catch {
    return null
  }

  if (!stats.isDirectory()) {
    return stats.mtimeMs
  }

  let latest = stats.mtimeMs
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  for (const entry of entries) {
    const nestedPath = path.join(targetPath, entry.name)
    const nestedLatest = await getLatestMtimeMs(nestedPath)
    if (nestedLatest !== null && nestedLatest > latest) {
      latest = nestedLatest
    }
  }
  return latest
}

const warnIfFrontendBuildIsOutdated = async () => {
  const sourceTimes = await Promise.all(FRONTEND_SOURCE_PATHS.map((sourcePath) => getLatestMtimeMs(sourcePath)))
  const latestSource = sourceTimes.reduce((max, value) => (value !== null && value > max ? value : max), 0)
  if (!latestSource) {
    return
  }

  const latestBuild = await getLatestMtimeMs(FRONTEND_BUILD_PATH)
  if (!latestBuild) {
    console.warn('[browser-test] Warning: frontend build is missing from packages/back/public. Run `yarn build`.')
    return
  }

  if (latestSource > latestBuild) {
    console.warn('[browser-test] Warning: frontend sources changed after last build. Run `yarn build` to refresh packages/back/public.')
  }
}

const dismissOnboarding = async (page) => {
  const hasTracks = (await page.locator('.track').count()) > 0
  if (hasTracks) {
    return
  }

  const skipButton = page.locator('[data-test-id="button-skip"]').first()
  try {
    await skipButton.waitFor({ state: 'visible', timeout: 500 })
  } catch (e) {
    return
  }

  await skipButton.click({ timeout: 2000 })
  await skipButton.waitFor({ state: 'hidden', timeout: 2000 })
}

const initialize = async () => {
  await initDb()
  await warnIfFrontendBuildIsOutdated()

  const { server, port } = await startServer()
  console.log(`[browser-test] Using server port ${port}`)
  const baseURL = `http://localhost:${port}`

  const headed = process.env.PW_HEADED === '1' || process.env.PWDEBUG === '1'
  const slowMo = Number(process.env.PW_SLOWMO || 0)
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: Number.isFinite(slowMo) ? slowMo : 0,
  })
  const context = await browser.newContext({ baseURL })

  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (!requestUrl.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }

    const targetUrl = `${baseURL}${requestUrl.pathname}${requestUrl.search}`
    await route.continue({ url: targetUrl })
  })
  
  const page = await context.newPage()
  await page.goto('/')

  const loginStatus = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpwd' }),
    })
    return res.status
  })
  if (loginStatus !== 204) {
    throw new Error(`Login failed with status ${loginStatus}`)
  }
  const sessionCookies = await context.cookies(baseURL)
  if (!sessionCookies.some(({ name }) => name === 'connect.sid')) {
    throw new Error('Login did not establish a session cookie')
  }
  await page.goto('/')
  await page.waitForSelector('.tracks-table', { timeout: 15000 })
  await dismissOnboarding(page)

  process.on('exit', () => server.kill())

  return { server, browser, context, page }
}

module.exports.getSharedContext = () => {
  if (!initPromise) {
    initPromise = initialize()
  }
  return initPromise
}

module.exports.dismissOnboarding = dismissOnboarding
