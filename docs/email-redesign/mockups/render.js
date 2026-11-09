const { chromium } = require('playwright')
const path = require('path')

const dir = __dirname
const variants = ['email-a-light-band', 'email-b-dark', 'email-c-minimal']

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ deviceScaleFactor: 2 })
  await page.setViewportSize({ width: 700, height: 900 })
  for (const v of variants) {
    await page.goto('file://' + path.join(dir, v + '.html'))
    await page.waitForTimeout(600) // let webfont load
    await page.screenshot({ path: path.join(dir, v + '.png'), fullPage: true })
    console.log('rendered', v)
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
