const { expect } = require('chai')
const { test } = require('cascade-test')
const { getMobileContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const TRACK_SELECTOR = '.tracks-table .track'

// POST /api/me/tracks/:id (numeric id) is the heard toggle; exclude sibling
// paths like /api/me/tracks/heard-lookup.
const isHeardPost = (request) =>
  request.method() === 'POST' && /\/api\/me\/tracks\/\d+$/.test(new URL(request.url()).pathname)

// Dispatch a synthetic touch on the first track row. The swipe-to-mark-heard
// handlers live on the row itself, so we target it directly (mirrors the
// approach used by the pull-to-refresh demo test). The mobile context enables
// touch, which is what unlocks the gesture in the app.
const dispatchRowTouch = (page, type, clientX, clientY) =>
  page.evaluate(
    ({ type, clientX, clientY, selector }) => {
      const row = document.querySelector(selector)
      if (!row) throw new Error('track row not found')
      const touch = new Touch({
        identifier: 1,
        target: row,
        clientX,
        clientY,
        pageX: clientX,
        pageY: clientY,
      })
      const list = type === 'touchend' ? [] : [touch]
      const event = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: list,
        targetTouches: list,
        changedTouches: [touch],
      })
      row.dispatchEvent(event)
    },
    { type, clientX, clientY, selector: TRACK_SELECTOR },
  )

const getFirstTrackRect = (page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(selector)
    if (!row) throw new Error('track row not found')
    const { left, top, width, height } = row.getBoundingClientRect()
    return { left, top, width, height }
  }, TRACK_SELECTOR)

test({
  setup: async () => {
    const { page } = await getMobileContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(TRACK_SELECTOR, { timeout: 15000 }),
      'Load the tracks table with at least one seeded row before exercising the swipe gesture.',
    )
    await dismissOnboarding(page)
    return { page, timeout: 30000 }
  },

  'swiping a track right past the threshold marks it heard': async ({ page }) => {
    const rect = await getFirstTrackRect(page)
    const startX = Math.floor(rect.left + 16)
    const y = Math.floor(rect.top + rect.height / 2)

    await dispatchRowTouch(page, 'touchstart', startX, y)

    // Begin swiping right, but stay below the threshold: the row slides right
    // and a panel grows from the left showing the two-line "Mark / heard" label.
    for (const offset of [24, 48, 72]) {
      await dispatchRowTouch(page, 'touchmove', startX + offset, y)
      await page.waitForTimeout(150)
    }
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          (selector) => {
            const row = document.querySelector(selector)
            const reveal = row && row.querySelector('.swipe-heard-reveal')
            if (!reveal || reveal.getBoundingClientRect().width <= 0) return false
            const slid = (row.style.transform || '').includes('translateX(')
            const lines = Array.from(reveal.querySelectorAll('.swipe-heard-indicator-line'))
              .map((el) => el.textContent.trim())
              .join(' ')
            return slid && lines === 'Mark heard'
          },
          TRACK_SELECTOR,
          { timeout: 3000 },
        ),
      'The row should slide right and show a "Mark heard" panel while swiping below the threshold.',
    )

    // Push past the threshold: the affordance flips to "Release to mark heard".
    for (const offset of [104, 124, 138]) {
      await dispatchRowTouch(page, 'touchmove', startX + offset, y)
      await page.waitForTimeout(150)
    }
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          (selector) => {
            const row = document.querySelector(selector)
            const indicator = row && row.querySelector('.swipe-heard-indicator')
            if (!indicator || !indicator.classList.contains('swipe-heard-indicator__armed')) return false
            const lines = Array.from(indicator.querySelectorAll('.swipe-heard-indicator-line'))
              .map((el) => el.textContent.trim())
              .join(' ')
            return lines === 'Release to mark heard'
          },
          TRACK_SELECTOR,
          { timeout: 3000 },
        ),
      'Past the threshold the indicator should arm and read "Release to mark heard".',
    )

    // Releasing past the threshold persists the "heard" state for the track.
    const heardRequest = page.waitForRequest(isHeardPost, { timeout: 5000 })
    await dispatchRowTouch(page, 'touchend', startX + 138, y)

    const request = await waitForWithTimeoutMessage(
      () => heardRequest,
      'Releasing a past-threshold swipe should POST the track as heard.',
    )
    expect(request.postDataJSON()).to.deep.equal({ heard: true })

    // The row slides back and the reveal panel collapses once the gesture
    // completes.
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          (selector) => {
            const row = document.querySelector(selector)
            if (!row) return false
            const reveal = row.querySelector('.swipe-heard-reveal')
            const collapsed = !reveal || reveal.getBoundingClientRect().width <= 0.5
            const settled = !(row.style.transform || '').includes('translateX(')
            return collapsed && settled
          },
          TRACK_SELECTOR,
          { timeout: 3000 },
        ),
      'The row should slide back and the reveal panel collapse after the swipe completes.',
    )

    // The gesture is reversible: swiping the now-heard track again marks it
    // unheard. The affordance reflects the opposite action.
    const heardRect = await getFirstTrackRect(page)
    const undoStartX = Math.floor(heardRect.left + 16)
    const undoY = Math.floor(heardRect.top + heardRect.height / 2)

    await dispatchRowTouch(page, 'touchstart', undoStartX, undoY)
    for (const offset of [24, 56, 88, 116, 138]) {
      await dispatchRowTouch(page, 'touchmove', undoStartX + offset, undoY)
      await page.waitForTimeout(150)
    }
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          (selector) => {
            const row = document.querySelector(selector)
            const indicator = row && row.querySelector('.swipe-heard-indicator')
            if (
              !indicator ||
              !indicator.classList.contains('swipe-heard-indicator__armed') ||
              !indicator.classList.contains('swipe-heard-indicator__unheard')
            ) {
              return false
            }
            const lines = Array.from(indicator.querySelectorAll('.swipe-heard-indicator-line'))
              .map((el) => el.textContent.trim())
              .join(' ')
            return lines === 'Release to mark unheard'
          },
          TRACK_SELECTOR,
          { timeout: 3000 },
        ),
      'Swiping a track that is already heard should offer to mark it unheard.',
    )

    const unheardRequest = page.waitForRequest(isHeardPost, { timeout: 5000 })
    await dispatchRowTouch(page, 'touchend', undoStartX + 138, undoY)

    const undoRequest = await waitForWithTimeoutMessage(
      () => unheardRequest,
      'Releasing a past-threshold swipe on a heard track should POST it as unheard.',
    )
    expect(undoRequest.postDataJSON()).to.deep.equal({ heard: false })
  },
})
