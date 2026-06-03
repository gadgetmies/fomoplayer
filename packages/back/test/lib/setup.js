const { chromium, devices } = require('playwright')
const fs = require('fs/promises')
const path = require('path')
const { initDb } = require('./db')
const { startServer } = require('./server')

let initPromise = null
let sharedBrowserContext = null
let sharedBrowser = null
let sharedBaseURL = null
let mobilePromise = null
// Contexts with an active Playwright trace, paired with the file the trace must
// be written to. Unlike video (flushed when the context/browser closes), a
// trace is only saved when `tracing.stop({ path })` is called explicitly, so we
// track every traced context here and stop them all during teardown.
let pendingTraces = []

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, '../front')
const FRONTEND_SOURCE_PATHS = ['src', 'public', 'package.json'].map((entry) => path.join(FRONTEND_ROOT, entry))
const FRONTEND_BUILD_PATH = path.join(BACKEND_ROOT, 'public')

const isRemotePreview = Boolean(process.env.PREVIEW_URL)
// When recording (VIDEO_DIR set) we want the same demo treatment locally as we
// give remote-preview runs: slow-mo pacing and the cursor/click/keyboard
// overlay, so a locally recorded video reads as a demo rather than a raw test.
const isRecording = Boolean(process.env.VIDEO_DIR)

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

// Start a Playwright trace on a context and remember where to write it. Called
// only when recording (VIDEO_DIR set) so a demo run produces a trace alongside
// its video. Screenshots + snapshots + sources give the full trace-viewer
// timeline (DOM snapshots, network, console, and test source).
const startTracing = async (context, tracePath) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  pendingTraces.push({ context, path: tracePath })
}

// Stop every active trace, writing each to its file. Must run before the owning
// context/browser closes, otherwise the trace is lost. Idempotent: the queue is
// captured and cleared up front so a second call can't double-stop.
const flushPendingTraces = async () => {
  if (pendingTraces.length === 0) {
    return
  }
  const traces = pendingTraces
  pendingTraces = []
  for (const { context, path: tracePath } of traces) {
    await context.tracing.stop({ path: tracePath }).catch((error) => {
      // Surface the cause: a swallowed failure leaves the trace missing/empty
      // and the CI verify step would then fail with no hint as to why.
      console.warn(`[browser-test] Failed to flush trace to ${tracePath}: ${error?.message ?? error}`)
    })
  }
}

// Close the recording context and browser so Playwright flushes the video to
// disk. Playwright only writes a recorded video when its context (or the owning
// browser) closes — closing the browser also finalises the videos of every
// context on it. Idempotent: each handle is captured and nulled before the
// (async) close so a second call (or a concurrent beforeExit) can't double-close.
const teardownSharedContext = async () => {
  // Save traces before closing anything — stopping a trace on a closed context
  // would throw and lose it.
  await flushPendingTraces()
  if (sharedBrowserContext) {
    const context = sharedBrowserContext
    sharedBrowserContext = null
    await context.close().catch(() => {})
  }
  if (sharedBrowser) {
    const browser = sharedBrowser
    sharedBrowser = null
    await browser.close().catch(() => {})
  }
  initPromise = null
}

// cascade-test ends every forked test process with `process.exit()` (see
// `setTimeout(() => process.exit(exitCode), 0)` in its runner). Node does NOT
// emit `beforeExit` for an explicit `process.exit()`, so the `beforeExit`
// cleanup below never runs under the test runner — which is why demo recordings
// came out as zero-byte files: Playwright created the video but the context was
// never closed to flush it. When recording, defer the real exit until the
// context/browser has closed (capped so a hung close can't wedge CI).
if (isRecording) {
  const realExit = process.exit.bind(process)
  let flushing = false
  process.exit = (code) => {
    if (flushing) {
      return realExit(code)
    }
    flushing = true
    const finish = () => realExit(code)
    const guard = setTimeout(finish, 10000)
    teardownSharedContext().finally(() => {
      clearTimeout(guard)
      finish()
    })
    return undefined
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
  sharedBaseURL = baseURL

  const headed = process.env.PW_HEADED === '1' || process.env.PWDEBUG === '1'
  const slowMoValue = process.env.PW_SLOWMO ?? process.env.PW_SLOMO ?? (isRemotePreview || isRecording ? '600' : '0')
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

  if (videoDir) {
    await startTracing(sharedBrowserContext, path.join(videoDir, 'trace.zip'))
  }

  if (isRemotePreview || isRecording) {
    await sharedBrowserContext.addInitScript(demoOverlay)
  }
  if (!isRemotePreview) {
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

  // Fallback for non-runner exits that do emit `beforeExit` (e.g. a plain
  // `node` invocation). Under cascade-test this never fires — the wrapped
  // `process.exit` above handles flushing the recording instead.
  process.on('beforeExit', () => {
    teardownSharedContext().catch(() => {})
  })

  return { server, browser: sharedBrowser, context: sharedBrowserContext, page }
}

// Some gestures (swipe-to-mark-heard, etc.) are only offered on touch / mobile
// devices, so they need a touch-enabled, phone-sized context to exercise. We
// build it on the shared browser and reuse the already-established login by
// copying cookies over, rather than re-running the login flow. Recording and
// the demo overlay are applied the same way as the shared context so the demo
// video reads as a phone interaction.
const initializeMobile = async () => {
  const { context: desktopContext } = await module.exports.getSharedContext()

  const mobileDevice = devices['Pixel 5']
  const videoDir = process.env.VIDEO_DIR
  const contextOptions = {
    ...mobileDevice,
    baseURL: sharedBaseURL,
  }
  if (videoDir) {
    contextOptions.recordVideo = { dir: videoDir, size: mobileDevice.viewport }
  }

  const mobileContext = await sharedBrowser.newContext(contextOptions)

  if (videoDir) {
    await startTracing(mobileContext, path.join(videoDir, 'trace-mobile.zip'))
  }

  if (isRemotePreview || isRecording) {
    await mobileContext.addInitScript(demoOverlay)
  }
  if (!isRemotePreview) {
    await mobileContext.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url())
      if (!requestUrl.pathname.startsWith('/api/')) {
        await route.continue()
        return
      }
      const targetUrl = `${sharedBaseURL}${requestUrl.pathname}${requestUrl.search}`
      await route.continue({ url: targetUrl })
    })
  }

  // Reuse the shared context's authenticated session instead of logging in again.
  const cookies = await desktopContext.cookies()
  if (cookies.length > 0) {
    await mobileContext.addCookies(cookies)
  }

  const page = await mobileContext.newPage()

  process.on('beforeExit', async () => {
    // Save any pending traces before closing — a trace can't be stopped on a
    // closed context.
    await flushPendingTraces()
    await mobileContext.close().catch(() => {})
  })

  return { context: mobileContext, page }
}

module.exports.getSharedContext = () => {
  if (!initPromise) {
    initPromise = initialize()
  }
  return initPromise
}

module.exports.getMobileContext = () => {
  if (!mobilePromise) {
    mobilePromise = initializeMobile()
  }
  return mobilePromise
}

module.exports.getBrowserContext = () => sharedBrowserContext

// Exposed so a test suite's `teardown` can also flush the recording explicitly
// (cascade-test awaits `teardown` before exiting); the wrapped `process.exit`
// makes this optional, but it's available for callers that want it.
module.exports.teardownSharedContext = teardownSharedContext

module.exports.dismissOnboarding = dismissOnboarding
module.exports.waitForWithTimeoutMessage = waitForWithTimeoutMessage
