import browser from '../../browser'

const STYLE_MARKER = 'data-fp-hide-native-play'
const STORAGE_KEY = 'hideBandcampNativePlay'

const HIDDEN_SELECTORS = [
  '.inline_player',
  '.play-button',
  '.play-col',
].join(', ')

const CSS_RULE = `${HIDDEN_SELECTORS} { display: none !important; }`

const findStyleEl = () => document.head.querySelector(`style[${STYLE_MARKER}]`)

const ensureStyleEl = () => {
  let el = findStyleEl()
  if (el) return el
  el = document.createElement('style')
  el.setAttribute(STYLE_MARKER, '1')
  el.textContent = CSS_RULE
  document.head.appendChild(el)
  return el
}

const apply = (hide) => {
  const el = ensureStyleEl()
  el.disabled = !hide
}

export const install = async () => {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const hide = stored[STORAGE_KEY] === undefined ? true : !!stored[STORAGE_KEY]
  apply(hide)

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return
    const next = changes[STORAGE_KEY].newValue
    apply(next === undefined ? true : !!next)
  })
}
