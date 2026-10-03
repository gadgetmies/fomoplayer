// Browser steps shared by the local and preview icon demo tests. They tour the icon-heavy views
// (track list and player, Support menu, every Settings tab, carts), check that each Font Awesome
// icon rendered a glyph, and that every expected icon appeared somewhere on the tour. Production
// builds render nothing (and log nothing) for an unknown icon name, so the expected list is what
// catches an icon that was renamed or dropped in a Font Awesome upgrade.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

const SETTINGS_TABS = ['following', 'carts', 'notifications', 'player', 'ignores', 'sorting', 'collection']

// data-icon carries the canonical name, so aliases used in the source (cog, search, times-circle,
// external-link-alt, step-forward, ...) appear here under their current names.
const EXPECTED_ICONS = [
  'backward',
  'backward-step',
  'ban',
  'bell',
  'caret-down',
  'cart-plus',
  'cart-shopping',
  'circle',
  'circle-exclamation',
  'circle-nodes',
  'circle-question',
  'circle-xmark',
  'clone',
  'forward',
  'forward-step',
  'gear',
  'github',
  'heart',
  'keyboard',
  'life-ring',
  'lightbulb',
  'magnifying-glass',
  'play',
  'plus',
  'puzzle-piece',
  'right-from-bracket',
  'share',
  'square-arrow-up-right',
  'up-right-from-square',
  'upload',
  'user-shield',
  'youtube',
]

const assertIconsRendered = async (page, view, seen) => {
  const icons = await page.$$eval('svg.svg-inline--fa', (svgs) =>
    svgs.map((svg) => ({
      name: svg.getAttribute('data-icon'),
      hasGlyph: Array.from(svg.querySelectorAll('path')).some((p) => (p.getAttribute('d') || '').length > 0),
    })),
  )
  expect(icons.length, `icons in ${view}`).to.be.greaterThan(0)
  expect(
    icons.filter((i) => !i.hasGlyph).map((i) => i.name),
    `icons without a glyph in ${view}`,
  ).to.deep.equal([])
  icons.forEach((i) => seen.add(i.name))
}

const tourIconViews = async ({ page }) => {
  const seen = new Set()
  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.tracks-table .track', { timeout: 15000 }),
    'Show the seeded tracks with their cart, follow and open-in-store icons.',
  )
  await page.locator('.track').first().hover()
  await assertIconsRendered(page, 'track list', seen)

  await page.click('[data-onboarding-id=support-button]')
  await waitForWithTimeoutMessage(
    () => page.getByText('Show Tutorial').waitFor({ timeout: 5000 }),
    'Open the Support menu with its icon buttons.',
  )
  await assertIconsRendered(page, 'support menu', seen)
  await page.keyboard.press('Escape')

  for (const tab of SETTINGS_TABS) {
    await page.goto(`/settings/${tab}`)
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('[data-onboarding-id=help-button]', { timeout: 15000 }),
      `Render the ${tab} settings tab.`,
    )
    await assertIconsRendered(page, `settings/${tab}`, seen)
  }

  await page.goto('/carts')
  await waitForWithTimeoutMessage(
    () => page.getByPlaceholder('Filter').waitFor({ timeout: 15000 }),
    'Render the carts view with its filter and track list.',
  )
  await assertIconsRendered(page, 'carts', seen)

  expect([...seen], 'icons seen on the tour').to.include.members(EXPECTED_ICONS)
}

module.exports = { tourIconViews }
