// Browser steps shared by the local and preview "cart review looks" demo tests (desktop and phone): the Review switch
// is visible on the cart bar while off, decided tracks are dimmed in the All tab (rejected ones also struck through),
// and the cart popup of a dimmed row covers the whole screen on a phone. Only the seeding differs per environment
// (see cart-review-seed.js); these steps do not.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { titleOf } = require('./cart-review-seed')
const { assertCartPopupAnchoredBottomAndOnTop } = require('./cart-popup-mobile-steps')

const ROW = '.tracks-table tbody tr.track'
const SWITCH = '[data-testid="cart-review-switch"]'
const DIMMED_OPACITY = 0.45
const pause = (page, ms = 800) => page.waitForTimeout(ms)

const rowFor = (page, key) => page.locator(ROW, { has: page.locator('.title-cell', { hasText: titleOf(key) }) })

const waitFor = (page, fn, arg, message, timeout = 10000) =>
  waitForWithTimeoutMessage(() => page.waitForFunction(fn, arg, { timeout }), message)

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

// WCAG relative luminance contrast between two computed `rgb(...)` colours.
const contrastRatio = (a, b) => {
  const luminance = (rgb) => {
    const [r, g, bl] = rgb
      .match(/\d+(\.\d+)?/g)
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The switch's track colour and the colour of the surface it sits on (the nearest ancestor with a background).
const switchColours = (page) =>
  page.$eval(SWITCH, (input) => {
    const slider = input.parentElement.querySelector('.toggle-button_slider')
    let surface = slider.parentElement
    let surfaceColour
    while (surface) {
      const colour = getComputedStyle(surface).backgroundColor
      if (colour && colour !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(colour)) {
        surfaceColour = colour
        break
      }
      surface = surface.parentElement
    }
    return { track: getComputedStyle(slider).backgroundColor, surface: surfaceColour || 'rgb(0, 0, 0)' }
  })

// The opacity of each cell of a row (the Review column apart) and whether its title is struck through.
const rowLook = (page, key) =>
  rowFor(page, key).evaluate((row) => ({
    cellOpacities: Array.from(row.children)
      .filter((cell) => cell.tagName === 'TD' && !cell.classList.contains('review-cell') && cell.offsetParent)
      .map((cell) => Number(getComputedStyle(cell).opacity)),
    reviewCellOpacities: Array.from(row.querySelectorAll(':scope > td.review-cell'))
      .filter((cell) => cell.offsetParent)
      .map((cell) => Number(getComputedStyle(cell).opacity)),
    titleDecoration: getComputedStyle(row.querySelector('.title-cell')).textDecorationLine,
  }))

const expectDimmed = (look, label) => {
  expect(look.cellOpacities, `${label}: cells`).to.not.be.empty
  look.cellOpacities.forEach((opacity) => expect(opacity, `${label}: cell opacity`).to.be.closeTo(DIMMED_OPACITY, 0.01))
  look.reviewCellOpacities.forEach((opacity) => expect(opacity, `${label}: the Review column stays bright`).to.equal(1))
}

const expectBright = (look, label) => {
  expect(look.cellOpacities, `${label}: cells`).to.not.be.empty
  look.cellOpacities.forEach((opacity) => expect(opacity, `${label}: cell opacity`).to.equal(1))
}

const decide = async (page, key, testId, counts) => {
  await rowFor(page, key).locator(`[data-testid="${testId}"]:visible`).click()
  await waitForCounts(page, counts)
  await pause(page)
}

module.exports.openCart = async (page, cart) => {
  await page.goto(`/carts/${cart.uuid}`)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(SWITCH, { state: 'attached', timeout: 20000 }),
    'Show the Review switch in the bar of the seeded demo cart.',
  )
  await waitForWithTimeoutMessage(
    () => rowFor(page, 'BC3').waitFor({ timeout: 20000 }),
    'List the seeded demo tracks in the cart.',
  )
  await pause(page)
}

// The off-state track must stand out from the cart bar (3:1, the WCAG minimum for a control's outline), or only the
// handle shows.
module.exports.reviewSwitchVisibleWhileOff = async ({ page }) => {
  expect(await page.isChecked(SWITCH), 'review starts off').to.equal(false)
  const { track, surface } = await switchColours(page)
  expect(contrastRatio(track, surface), `switch track ${track} on the cart bar ${surface}`).to.be.at.least(3)
  await pause(page, 1500)
}

module.exports.turnOnReview = async ({ page }) => {
  await page.click(`label.toggle-button:has(${SWITCH})`)
  await waitForCounts(page, { 'to-review': 7, accepted: 0, rejected: 0, all: 7 })
  expect(await page.isChecked('#cart-review-tab-all'), 'review opens on the All tab').to.equal(true)
  await pause(page)
}

module.exports.acceptAndRejectInAllTab = async ({ page }) => {
  await decide(page, 'BP2', 'review-accept', { 'to-review': 6, accepted: 1 })
  await decide(page, 'BP1', 'review-reject', { 'to-review': 5, rejected: 1 })
}

// In the All tab the decided tracks step back, so the ones still to review stand out.
module.exports.decidedTracksDimmedInAllTab = async ({ page }) => {
  const accepted = await rowLook(page, 'BP2')
  expectDimmed(accepted, 'accepted BP2')
  expect(accepted.titleDecoration, 'an accepted title is not struck through').to.equal('none')

  const rejected = await rowLook(page, 'BP1')
  expectDimmed(rejected, 'rejected BP1')
  expect(rejected.titleDecoration, 'a rejected title is struck through').to.equal('line-through')

  const toReview = await rowLook(page, 'BP3')
  expectBright(toReview, 'BP3 to review')
  expect(toReview.titleDecoration).to.equal('none')
  await pause(page, 1500)
}

module.exports.playingAcceptedTrackIsBright = async ({ page }) => {
  await rowFor(page, 'BP2').locator('.title-cell').click()
  await waitFor(
    page,
    ({ selector, title }) => document.querySelector(`${selector}.playing .title-cell`)?.textContent.trim() === title,
    { selector: ROW, title: titleOf('BP2') },
    'Clicking the accepted track should play it.',
  )
  expectBright(await rowLook(page, 'BP2'), 'playing accepted BP2')
  await pause(page, 1500)
}

// Only the All tab dims: the Accepted tab lists the accepted tracks at full strength.
module.exports.acceptedTabIsNotDimmed = async ({ page }) => {
  await page.click('[data-testid="cart-review-tab-accepted"]')
  await waitFor(
    page,
    ({ selector, title }) =>
      document.querySelector('#cart-review-tab-accepted')?.checked &&
      Array.from(document.querySelectorAll(`${selector} .title-cell`)).every((c) => c.textContent.trim() === title),
    { selector: ROW, title: titleOf('BP2') },
    'The Accepted tab lists only the accepted track.',
  )
  expectBright(await rowLook(page, 'BP2'), 'BP2 in the Accepted tab')
  await pause(page)
  await page.click('[data-testid="cart-review-tab-all"]')
  await rowFor(page, 'BP1').waitFor()
  await pause(page)
}

// Phone: the popup and its backdrop must not be trapped inside a dimmed row's cell.
const openCartPopupOf = async (page, key) => {
  await rowFor(page, key).locator('.table-cell-button-row .button-drop_down-right').click()
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.cart-popup.popup_content', { state: 'visible', timeout: 10000 }),
    `Tapping the cart caret of ${key} should open the add-to-cart popup.`,
  )
  await pause(page, 1500)
}

const popupEffectiveOpacity = (page) =>
  page.$eval('.cart-popup.popup_content', (content) => {
    let opacity = 1
    for (let el = content; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
    return opacity
  })

// Points across the whole screen must each hit the popup or its backdrop: nothing (later rows, the player) may paint
// over either of them.
const pointsNotCovered = (page) =>
  page.$eval('.cart-popup.popup_content', (content) => {
    const overlay = content.closest('.popup_container').nextElementSibling
    const missed = []
    for (const x of [10, Math.round(window.innerWidth / 2), window.innerWidth - 10]) {
      for (let y = 4; y < window.innerHeight; y += 20) {
        const hit = document.elementFromPoint(x, y)
        if (hit !== overlay && !content.contains(hit)) missed.push(`(${x}, ${y}): ${hit?.tagName}.${hit?.className}`)
      }
    }
    return missed
  })

const closeCartPopup = async (page) => {
  await page.click('.popup--open + .popup_overlay', { position: { x: 20, y: 20 } })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.cart-popup.popup_content', { state: 'detached', timeout: 10000 }),
    'Tapping the backdrop should close the add-to-cart popup.',
  )
  await pause(page)
}

const cartPopupOfDimmedRowCoversTheScreen =
  (key) =>
  async ({ page }) => {
    expectDimmed(await rowLook(page, key), `${key} before opening its popup`)
    await openCartPopupOf(page, key)
    await assertCartPopupAnchoredBottomAndOnTop({ page })
    expect(await pointsNotCovered(page), 'the popup and its backdrop cover the whole screen').to.deep.equal([])
    expect(await popupEffectiveOpacity(page), 'the popup is drawn at full strength').to.equal(1)
    await closeCartPopup(page)
    expectDimmed(await rowLook(page, key), `${key} after closing its popup`)
  }

module.exports.cartPopupOfRejectedRowCoversTheScreen = cartPopupOfDimmedRowCoversTheScreen('BP1')
module.exports.cartPopupOfAcceptedRowCoversTheScreen = cartPopupOfDimmedRowCoversTheScreen('BP2')

// Desktop: the cart popup opens on hover, below its row. It must be drawn at full strength and not be painted over by
// the rows below, while merely pointing at a dimmed row leaves it dimmed.
const hoverPopupLook = (page, key) =>
  rowFor(page, key)
    .locator('.cart-popup.popup_content')
    .evaluate((content) => {
      let opacity = 1
      for (let el = content; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
      const rect = content.getBoundingClientRect()
      const covered = []
      for (let x = rect.left + 4; x < rect.right - 2; x += 20) {
        for (let y = rect.top + 4; y < Math.min(rect.bottom, window.innerHeight) - 2; y += 20) {
          const hit = document.elementFromPoint(x, y)
          if (!content.contains(hit))
            covered.push(`(${Math.round(x)}, ${Math.round(y)}): ${hit?.tagName}.${hit?.className}`)
        }
      }
      return { opacity, covered }
    })

const hoverCartPopupOfDimmedRow =
  (key) =>
  async ({ page }) => {
    await rowFor(page, key).locator('.title-cell').hover()
    expectDimmed(await rowLook(page, key), `${key} while pointing at its title`)
    await rowFor(page, key).locator('.table-cell-button-row .button-drop_down-right').hover()
    await waitForWithTimeoutMessage(
      () => rowFor(page, key).locator('.cart-popup.popup_content').waitFor({ state: 'visible', timeout: 10000 }),
      `Pointing at the cart caret of ${key} should open the add-to-cart popup.`,
    )
    await pause(page, 1500)
    const { opacity, covered } = await hoverPopupLook(page, key)
    expect(opacity, 'the popup is drawn at full strength').to.equal(1)
    expect(covered, 'nothing paints over the popup').to.deep.equal([])
    await page.mouse.move(5, 5)
    await waitForWithTimeoutMessage(
      () => rowFor(page, key).locator('.cart-popup.popup_content').waitFor({ state: 'hidden', timeout: 10000 }),
      `Pointing away should close the add-to-cart popup of ${key}.`,
    )
    expectDimmed(await rowLook(page, key), `${key} after its popup closed`)
    await pause(page)
  }

module.exports.hoverCartPopupOfRejectedRow = hoverCartPopupOfDimmedRow('BP1')
module.exports.hoverCartPopupOfAcceptedRow = hoverCartPopupOfDimmedRow('BP2')
