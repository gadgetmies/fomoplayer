// "Add to Fomo Player cart" dropdown. Renders inside a shadow DOM so
// bandcamp's CSS doesn't fight ours, but visually it tracks bandcamp's dark
// monochrome typography. Mirrors the spirit of the frontend
// CartDropDownButton component without dragging React onto bandcamp.com.
import browser from '../../browser'

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

const STYLE = `
  :host { all: initial; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: inline-block; position: relative; }
  .root { display: inline-block; position: relative; }
  button.toggle {
    background: transparent; color: #0687f5; border: 1px solid #0687f5;
    font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 4px; line-height: 1.4;
  }
  button.toggle:hover { background: #0687f5; color: #fff; }
  .popup {
    position: absolute; right: 0; top: calc(100% + 4px);
    background: #fff; color: #222; border: 1px solid #ddd; border-radius: 4px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15); min-width: 220px; max-width: 280px;
    padding: 8px; z-index: 2147483647;
  }
  .popup.hidden { display: none; }
  .popup .row { font-size: 12px; padding: 6px 8px; cursor: pointer; border-radius: 2px; display: flex; gap: 6px; align-items: center; }
  .popup .row:hover { background: #f4f4f4; }
  .popup .empty { font-size: 12px; color: #777; padding: 6px 8px; text-align: center; }
  .popup .new { display: flex; gap: 4px; padding-top: 6px; border-top: 1px solid #eee; margin-top: 6px; }
  .popup .new input { flex: 1; min-width: 0; font-size: 12px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 2px; }
  .popup .new button { font-size: 12px; padding: 4px 8px; cursor: pointer; }
  .popup .status { font-size: 11px; color: #1a7d33; padding: 4px 8px; }
  .popup .error { font-size: 11px; color: #c63; padding: 4px 8px; }
  svg { width: 11px; height: 11px; fill: currentColor; }
`

const CART_ICON = '<svg viewBox="0 0 16 16"><path d="M2 2 H4 L5 5 H14 L13 11 H6 L5 5 M6 13 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M11 13 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>'
const PLUS_ICON = '<svg viewBox="0 0 16 16"><path d="M8 3 v10 M3 8 h10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'

let openHost = null

const closeOpen = () => {
  if (openHost && openHost.shadowRoot) {
    const popup = openHost.shadowRoot.querySelector('.popup')
    if (popup) popup.classList.add('hidden')
  }
  openHost = null
}

document.addEventListener('click', (e) => {
  if (!openHost) return
  if (e.composedPath && e.composedPath().includes(openHost)) return
  closeOpen()
})

export const renderCartButton = ({ getReleases, label = 'Add to Fomo Player' }) => {
  const host = document.createElement('span')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="root">
      <button class="toggle" data-toggle>${CART_ICON}<span>${label}</span></button>
      <div class="popup hidden" data-popup>
        <div data-list><div class="empty">Loading carts…</div></div>
        <div class="new">
          <input data-new placeholder="New cart name" />
          <button data-create>${PLUS_ICON}</button>
        </div>
        <div data-status></div>
      </div>
    </div>
  `

  const popup = shadow.querySelector('[data-popup]')
  const list = shadow.querySelector('[data-list]')
  const newInput = shadow.querySelector('[data-new]')
  const createBtn = shadow.querySelector('[data-create]')
  const statusBox = shadow.querySelector('[data-status]')

  const setStatus = (text, type = 'status') => {
    statusBox.innerHTML = text ? `<div class="${type}">${text}</div>` : ''
    if (text) setTimeout(() => (statusBox.innerHTML = ''), 4000)
  }

  const loadCarts = async () => {
    list.innerHTML = '<div class="empty">Loading carts…</div>'
    const response = await sendToWorker({ type: 'bandcamp:get-carts' })
    if (!response?.ok) {
      list.innerHTML = `<div class="error">${response?.error || 'Failed to load carts'}</div>`
      return
    }
    const carts = response.carts || []
    if (carts.length === 0) {
      list.innerHTML = '<div class="empty">No carts yet — create one below.</div>'
      return
    }
    list.innerHTML = carts
      .map((c) => `<div class="row" data-cart-id="${c.id}">${PLUS_ICON} ${escapeHtml(c.name)}</div>`)
      .join('')
    list.querySelectorAll('[data-cart-id]').forEach((row) => {
      row.addEventListener('click', async () => {
        const cartId = Number(row.dataset.cartId)
        const releases = await getReleases()
        const result = await sendToWorker({ type: 'bandcamp:add-to-cart', cartId, releases })
        if (result?.ok) {
          setStatus(`Added ${result.addedCount || 0} track${result.addedCount === 1 ? '' : 's'}`)
          closeOpen()
        } else {
          setStatus(result?.error || 'Failed to add to cart', 'error')
        }
      })
    })
  }

  shadow.querySelector('[data-toggle]').addEventListener('click', async (e) => {
    e.stopPropagation()
    if (openHost === host) {
      closeOpen()
      return
    }
    closeOpen()
    openHost = host
    popup.classList.remove('hidden')
    await loadCarts()
  })

  createBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const name = newInput.value.trim()
    if (!name) return
    const response = await sendToWorker({ type: 'bandcamp:create-cart', name })
    if (!response?.ok) {
      setStatus(response?.error || 'Failed to create cart', 'error')
      return
    }
    newInput.value = ''
    const cartId = response.cart?.id
    if (cartId) {
      const releases = await getReleases()
      const addResult = await sendToWorker({ type: 'bandcamp:add-to-cart', cartId, releases })
      if (addResult?.ok) {
        setStatus(`Created and added ${addResult.addedCount || 0} track${addResult.addedCount === 1 ? '' : 's'}`)
        closeOpen()
      } else {
        setStatus(addResult?.error || 'Created cart but add failed', 'error')
      }
    } else {
      await loadCarts()
    }
  })

  return host
}

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
