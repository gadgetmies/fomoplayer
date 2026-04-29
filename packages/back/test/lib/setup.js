const { chromium } = require('playwright')
const fs = require('fs/promises')
const path = require('path')
const { initDb } = require('./db')
const { startServer } = require('./server')

let initPromise = null
let sharedBrowserContext = null
let sharedBrowser = null

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, '../front')
const FRONTEND_SOURCE_PATHS = ['src', 'public', 'package.json'].map((entry) => path.join(FRONTEND_ROOT, entry))
const FRONTEND_BUILD_PATH = path.join(BACKEND_ROOT, 'public')

const isRemotePreview = Boolean(process.env.PREVIEW_URL)

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

const waitForWithTimeoutMessage = async (waitOperation, timeoutMessage) => {
  try {
    return await waitOperation()
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new Error(timeoutMessage, { cause: error })
    }
    throw error
  }
}

const dismissOnboarding = async (page) => {
  const hasTracks = (await page.locator('.track').count()) > 0
  if (hasTracks) {
    return
  }

  const skipButton = page.locator('[data-test-id="button-skip"]').first()
  try {
    await waitForWithTimeoutMessage(
      () => skipButton.waitFor({ state: 'visible', timeout: 500 }),
      'Detect onboarding skip button visibility before deciding to dismiss onboarding.',
    )
  } catch (e) {
    return
  }

  await skipButton.click({ timeout: 2000 })
  await waitForWithTimeoutMessage(
    () => skipButton.waitFor({ state: 'hidden', timeout: 2000 }),
    'Ensure onboarding closes after clicking the skip button.',
  )
}

// Injected into every page in remote demo mode to visualise cursor, clicks,
// keyboard events, and scroll direction.
const demoOverlay = () => {
  const cursor = document.createElement('div')
  Object.assign(cursor.style, {
    position: 'fixed',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '3px solid rgba(255,120,0,.9)',
    backgroundColor: 'rgba(255,120,0,.15)',
    boxShadow: '0 0 8px rgba(255,120,0,.5)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transform: 'translate(-50%,-50%)',
    transition: 'transform .08s,background-color .08s',
    display: 'none',
  })
  document.addEventListener('mousemove', (e) => {
    cursor.style.display = 'block'
    cursor.style.left = e.clientX + 'px'
    cursor.style.top = e.clientY + 'px'
  })
  document.addEventListener('mousedown', () => {
    cursor.style.backgroundColor = 'rgba(255,120,0,.5)'
    cursor.style.transform = 'translate(-50%,-50%) scale(.75)'
  })
  document.addEventListener('mouseup', () => {
    cursor.style.backgroundColor = 'rgba(255,120,0,.15)'
    cursor.style.transform = 'translate(-50%,-50%) scale(1)'
  })

  const spawnRipple = (x, y) => {
    const r = document.createElement('div')
    Object.assign(r.style, {
      position: 'fixed',
      left: x + 'px',
      top: y + 'px',
      width: '50px',
      height: '50px',
      borderRadius: '50%',
      border: '2px solid rgba(255,120,0,.8)',
      backgroundColor: 'rgba(255,120,0,.2)',
      transform: 'translate(-50%,-50%) scale(0)',
      pointerEvents: 'none',
      zIndex: '2147483646',
    })
    document.body.appendChild(r)
    r.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(2.5)', opacity: 0 },
      ],
      { duration: 500, easing: 'ease-out' },
    ).onfinish = () => r.remove()
  }
  document.addEventListener('click', (e) => spawnRipple(e.clientX, e.clientY))
  document.addEventListener('contextmenu', (e) => spawnRipple(e.clientX, e.clientY))

  const kbd = document.createElement('div')
  Object.assign(kbd.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,.82)',
    color: '#fff',
    borderRadius: '10px',
    padding: '10px 20px',
    fontSize: '17px',
    fontFamily: '"SF Mono","Fira Code",monospace',
    pointerEvents: 'none',
    zIndex: '2147483647',
    display: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,.4)',
  })
  const heldKeys = new Set()
  let kbdTimer
  document.addEventListener('keydown', (e) => {
    if (!e.repeat) heldKeys.add(e.key)
    clearTimeout(kbdTimer)
    if (heldKeys.size > 0) {
      kbd.style.display = 'block'
      kbd.textContent = [...heldKeys].map((k) => (k.length === 1 ? k : `[${k}]`)).join(' + ')
    }
  })
  document.addEventListener('keyup', (e) => {
    heldKeys.delete(e.key)
    if (heldKeys.size > 0) {
      kbd.textContent = [...heldKeys].map((k) => (k.length === 1 ? k : `[${k}]`)).join(' + ')
    } else {
      kbdTimer = setTimeout(() => {
        kbd.style.display = 'none'
        kbd.textContent = ''
      }, 700)
    }
  })

  const scrollEl = document.createElement('div')
  Object.assign(scrollEl.style, {
    position: 'fixed',
    right: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: 'rgba(0,0,0,.75)',
    color: '#fff',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '22px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    display: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,.4)',
  })
  let scrollTimer
  document.addEventListener(
    'scroll',
    (e) => {
      const t = e.target
      const prev = t._demoScrollTop ?? 0
      const cur = t === document ? window.scrollY : t.scrollTop
      t._demoScrollTop = cur
      scrollEl.textContent = cur > prev ? '↓' : '↑'
      scrollEl.style.display = 'block'
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => (scrollEl.style.display = 'none'), 700)
    },
    true,
  )

  const mount = () => {
    document.body.appendChild(cursor)
    document.body.appendChild(kbd)
    document.body.appendChild(scrollEl)
  }
  if (document.body) {
    mount()
  } else {
    document.addEventListener('DOMContentLoaded', mount)
  }
}

const initialize = async () => {
  let baseURL, server

  if (isRemotePreview) {
    baseURL = process.env.PREVIEW_URL
    server = null
  } else {
    await initDb()
    await warnIfFrontendBuildIsOutdated()
    const result = await startServer()
    console.log(`[browser-test] Using server port ${result.port}`)
    server = result.server
    baseURL = `http://localhost:${result.port}`
  }

  const headed = process.env.PW_HEADED === '1' || process.env.PWDEBUG === '1'
  const slowMoValue = process.env.PW_SLOWMO ?? process.env.PW_SLOMO ?? (isRemotePreview ? '600' : '0')
  const slowMo = Number(slowMoValue)

  sharedBrowser = await chromium.launch({
    headless: !headed,
    slowMo: Number.isFinite(slowMo) ? slowMo : 0,
  })

  const videoDir = process.env.VIDEO_DIR
  const contextOptions = { baseURL }
  if (videoDir) {
    contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 720 } }
  }
  sharedBrowserContext = await sharedBrowser.newContext(contextOptions)

  if (isRemotePreview) {
    await sharedBrowserContext.addInitScript(demoOverlay)
  } else {
    await sharedBrowserContext.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url())
      if (!requestUrl.pathname.startsWith('/api/')) {
        await route.continue()
        return
      }
      const targetUrl = `${baseURL}${requestUrl.pathname}${requestUrl.search}`
      await route.continue({ url: targetUrl })
    })
  }

  const page = await sharedBrowserContext.newPage()
  await page.goto('/tracks/recent')

  if (isRemotePreview) {
    const oidcToken = process.env.OIDC_TOKEN
    if (!oidcToken) throw new Error('OIDC_TOKEN env var is required for remote preview login')
    const loginRes = await page.request.post(`${baseURL}/api/auth/login/actions`, {
      data: { token: oidcToken },
    })
    if (!loginRes.ok()) {
      throw new Error(`Remote preview OIDC login failed: HTTP ${loginRes.status()} — ${await loginRes.text()}`)
    }
  } else {
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
    const sessionCookies = await sharedBrowserContext.cookies(baseURL)
    if (!sessionCookies.some(({ name }) => name === 'connect.sid')) {
      throw new Error('Login did not establish a session cookie')
    }
  }

  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
    'Load the tracks table after login redirects to the recent tracks page.',
  )
  await dismissOnboarding(page)

  if (server) {
    process.on('exit', () => server.kill())
  }

  // Finalize video recording (if active) before process exits.
  process.on('beforeExit', async () => {
    if (sharedBrowserContext) {
      await sharedBrowserContext.close().catch(() => {})
      sharedBrowserContext = null
    }
    if (sharedBrowser) {
      await sharedBrowser.close().catch(() => {})
      sharedBrowser = null
    }
  })

  return { server, browser: sharedBrowser, context: sharedBrowserContext, page }
}

module.exports.getSharedContext = () => {
  if (!initPromise) {
    initPromise = initialize()
  }
  return initPromise
}

module.exports.getBrowserContext = () => sharedBrowserContext

module.exports.dismissOnboarding = dismissOnboarding
module.exports.waitForWithTimeoutMessage = waitForWithTimeoutMessage
