// Browser steps shared by the local and preview cart review demo tests (desktop and phone). Only the seeding differs
// per environment (see cart-review-seed.js); these steps do not.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { titleOf } = require('./cart-review-seed')

const ROW = '.tracks-table tbody tr.track'
const pause = (page, ms = 800) => page.waitForTimeout(ms)

const rowTitles = (page) =>
  page.$$eval(`${ROW} .title-cell`, (cells) => cells.map((cell) => cell.textContent.trim()))

const rowFor = (page, key) => page.locator(ROW, { has: page.locator('.title-cell', { hasText: titleOf(key) }) })

const tabCount = (page, testId) =>
  page.$eval(`[data-testid="${testId}"] small`, (small) => Number(small.textContent.trim()))

const waitFor = (page, fn, arg, message, timeout = 10000) =>
  waitForWithTimeoutMessage(() => page.waitForFunction(fn, arg, { timeout }), message)

// Waits until the review tabs show the given counts.
const waitForCounts = (page, counts) =>
  waitFor(
    page,
    (expected) =>
      Object.entries(expected).every(([id, count]) => {
        const small = document.querySelector(`[data-testid="cart-review-tab-${id}"] small`)
        return small && Number(small.textContent.trim()) === count
      }),
    counts,
    `The review tabs should show the counts ${JSON.stringify(counts)}.`,
  )

const waitForRows = async (page, keys, message) => {
  try {
    await page.waitForFunction(
      ({ selector, titles }) =>
        JSON.stringify(
          Array.from(document.querySelectorAll(`${selector} .title-cell`)).map((c) => c.textContent.trim()),
        ) === JSON.stringify(titles),
      { selector: ROW, titles: keys.map(titleOf) },
      { timeout: 10000 },
    )
  } catch (e) {
    throw new Error(`${message} Expected ${keys.join(', ')}, listed: ${(await rowTitles(page)).join(', ')}`)
  }
}

const clickReviewSwitch = (page) => page.click('label.toggle-button:has([data-testid="cart-review-switch"])')

module.exports.openCartAndTurnOnReview = async (page, cart) => {
  await page.goto(`/carts/${cart.uuid}`)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-testid="cart-review-switch"]', { state: 'attached', timeout: 20000 }),
    'Show the Review switch in the bar of the seeded demo cart.',
  )
  await waitForRows(page, ['BP1', 'BP2', 'BP3', 'BC1', 'BP4', 'BC2', 'BC3'], 'List the seven demo tracks.')
  await pause(page)
  await clickReviewSwitch(page)
  await waitForCounts(page, { 'to-review': 7, accepted: 0, rejected: 0, all: 7 })
  await pause(page)
}

module.exports.reviewControlsReplaceFindSimilar = async ({ page }) => {
  expect(await page.$('[data-testid="cart-find-similar"]'), 'Find similar is hidden while reviewing').to.equal(null)
  expect(await page.isDisabled('[data-testid="cart-review-open-accepted"]'), 'nothing accepted yet').to.equal(true)
  expect(await page.isDisabled('[data-testid="cart-review-modify-rejected"]'), 'nothing rejected yet').to.equal(true)
  expect(await tabCount(page, 'cart-review-store-beatport')).to.equal(4)
  expect(await tabCount(page, 'cart-review-store-bandcamp')).to.equal(3)
}

module.exports.acceptFromRow = async ({ page }) => {
  await rowFor(page, 'BP2').locator('[data-testid="review-accept"]').click()
  await waitForCounts(page, { 'to-review': 6, accepted: 1 })
  expect(await rowTitles(page)).to.not.include(titleOf('BP2'))
  await pause(page)
}

module.exports.rejectPlayingTrackFromPlayer = async ({ page }) => {
  await rowFor(page, 'BP1').locator('.title-cell').click()
  const rejectInPanel = '.preview-review_buttons [data-testid="review-reject"]'
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(rejectInPanel, { timeout: 10000 }),
    'Show the review buttons in the player panel for a track playing from the cart under review.',
  )
  await pause(page, 1500)
  await page.click(rejectInPanel)
  // BP2 is accepted, so the player moves on to BP3, the next track still to review.
  await waitFor(
    page,
    ({ selector, title }) => document.querySelector(`${selector}.playing .title-cell`)?.textContent.trim() === title,
    { selector: ROW, title: titleOf('BP3') },
    'Rejecting the playing track should play the next track still to review.',
  )
  await waitForCounts(page, { 'to-review': 5, accepted: 1, rejected: 1 })
  await pause(page)
}

module.exports.decideMoreFromRows = async ({ page }) => {
  await rowFor(page, 'BC1').locator('[data-testid="review-reject"]').click()
  await waitForCounts(page, { 'to-review': 4, rejected: 2 })
  await rowFor(page, 'BC2').locator('[data-testid="review-accept"]').click()
  await waitForCounts(page, { 'to-review': 3, accepted: 2 })
  await waitForRows(page, ['BP3', 'BP4', 'BC3'], 'Only the tracks still to review stay in the To review tab.')
  await pause(page)
}

module.exports.narrowToOneStore = async ({ page }) => {
  await page.click('[data-testid="cart-review-store-bandcamp"]')
  await waitForRows(page, ['BC3'], 'The Bandcamp tab lists only Bandcamp tracks still to review.')
  await waitForCounts(page, { 'to-review': 1, accepted: 1, rejected: 1, all: 3 })
  await pause(page, 1500)
  await page.click('[data-testid="cart-review-store-all"]')
  await waitForCounts(page, { 'to-review': 3, accepted: 2, rejected: 2, all: 7 })
  await pause(page)
}

module.exports.reviewSurvivesReload = async ({ page }) => {
  await page.reload()
  await waitForCounts(page, { 'to-review': 3, accepted: 2, rejected: 2 })
  expect(await page.isChecked('[data-testid="cart-review-switch"]')).to.equal(true)
  await waitForRows(page, ['BP3', 'BP4', 'BC3'], 'The cart reopens in review on its To review tab.')
}

module.exports.removeRejectedAndUndo = async ({ page }) => {
  await page.click('[data-testid="cart-review-tab-rejected"]')
  await waitForRows(page, ['BP1', 'BC1'], 'The Rejected tab lists the two rejected tracks.')
  await pause(page)
  await page.hover('[data-testid="cart-review-modify-rejected"]')
  await page.click('[data-testid="cart-review-remove-rejected"]')
  await waitFor(
    page,
    () => document.querySelector('[data-testid="undo-notice"]')?.textContent.includes('Removed 2 rejected tracks'),
    undefined,
    'A notice should say the two rejected tracks were removed, with Undo.',
  )
  await waitForCounts(page, { rejected: 0, all: 5 })
  await pause(page, 1500)
  await page.click('[data-testid="undo-notice-undo"]')
  await waitForCounts(page, { rejected: 2, all: 7 })
  await waitForRows(page, ['BP1', 'BC1'], 'Undo puts the rejected tracks back in their place.')
  await pause(page)
}

module.exports.openAcceptedInTabs = async ({ page }) => {
  await page.click('[data-testid="cart-review-tab-accepted"]')
  await waitForRows(page, ['BP2', 'BC2'], 'The Accepted tab lists the two accepted tracks.')
  await waitFor(
    page,
    () => document.querySelector('[data-testid="cart-review-open-accepted"]')?.disabled === false,
    undefined,
    'Open accepted is enabled once there are accepted tracks.',
  )
  const opened = []
  const onPage = (popup) => opened.push(popup)
  page.context().on('page', onPage)
  await page.route(/(beatport\.com|bandcamp\.com)\//, (route) => route.fulfill({ status: 200, body: 'store page' }))
  try {
    await page.click('[data-testid="cart-review-open-accepted"]')
    await waitForWithTimeoutMessage(async () => {
      const deadline = Date.now() + 10000
      while (opened.length < 2 && Date.now() < deadline) await page.waitForTimeout(100)
      if (opened.length < 2) throw new Error(`only ${opened.length} tabs opened`)
    }, 'Open accepted should open one tab per accepted track.')
    expect(opened).to.have.length(2)
  } finally {
    page.context().off('page', onPage)
    for (const popup of opened) await popup.close().catch(() => {})
    await page.unroute(/(beatport\.com|bandcamp\.com)\//)
  }
}

// Phone: a synthetic touch swipe on a row, as in swipe-mark-heard.js.
const swipeRow = async (page, key, distance) => {
  const title = titleOf(key)
  const touch = (type, x, y) =>
    page.evaluate(
      ({ type, x, y, selector, title }) => {
        const row = Array.from(document.querySelectorAll(selector)).find(
          (r) => r.querySelector('.title-cell')?.textContent.trim() === title,
        )
        if (!row) throw new Error(`row ${title} not found`)
        const t = new Touch({ identifier: 1, target: row, clientX: x, clientY: y, pageX: x, pageY: y })
        const list = type === 'touchend' ? [] : [t]
        row.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: list,
            targetTouches: list,
            changedTouches: [t],
          }),
        )
      },
      { type, x, y, selector: ROW, title },
    )
  const box = await rowFor(page, key).boundingBox()
  const startX = Math.floor(box.x + box.width / 2)
  const y = Math.floor(box.y + box.height / 2)
  await touch('touchstart', startX, y)
  const steps = 6
  for (let i = 1; i <= steps; i++) {
    await touch('touchmove', startX + Math.round((distance * i) / steps), y)
    await page.waitForTimeout(120)
  }
  return { release: () => touch('touchend', startX + distance, y) }
}

const revealText = (page, key) =>
  rowFor(page, key)
    .locator('.swipe-heard-indicator-line')
    .allTextContents()
    .then((lines) => lines.map((l) => l.trim()).join(' '))

module.exports.swipeRightAccepts = async ({ page }) => {
  const swipe = await swipeRow(page, 'BP1', 130)
  expect(await revealText(page, 'BP1')).to.equal('Release to accept')
  await pause(page)
  await swipe.release()
  await waitForCounts(page, { 'to-review': 6, accepted: 1 })
  await waitFor(
    page,
    (title) => document.querySelector('[data-testid="undo-notice"]')?.textContent.includes(`Accepted ${title}`),
    titleOf('BP1'),
    'A notice names the accepted track, with Undo.',
  )
  await pause(page)
}

module.exports.shortSwipeChangesNothing = async ({ page }) => {
  const swipe = await swipeRow(page, 'BP2', -40)
  await swipe.release()
  await pause(page)
  expect(await tabCount(page, 'cart-review-tab-to-review')).to.equal(6)
}

module.exports.swipeLeftRejectsAndUndo = async ({ page }) => {
  const swipe = await swipeRow(page, 'BP2', -130)
  expect(await revealText(page, 'BP2')).to.equal('Release to reject')
  await pause(page)
  await swipe.release()
  await waitForCounts(page, { 'to-review': 5, rejected: 1 })
  await pause(page, 1500)
  await page.click('[data-testid="undo-notice-undo"]')
  await waitForCounts(page, { 'to-review': 6, rejected: 0 })
  await waitFor(
    page,
    ({ selector, title }) =>
      Array.from(document.querySelectorAll(`${selector} .title-cell`)).some((c) => c.textContent.trim() === title),
    { selector: ROW, title: titleOf('BP2') },
    'Undo puts the swiped track back in the To review tab.',
  )
}
