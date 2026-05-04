// "Add to Fomo Player cart" dropdown. Renders inside a shadow DOM so
// bandcamp's CSS doesn't fight ours, but visually it tracks bandcamp's dark
// monochrome typography. Mirrors the spirit of the frontend
// CartDropDownButton component without dragging React onto bandcamp.com.
//
// Sole consumer: ./inject.js (release-title, per-track, discography call
// sites). Item 009's "remove from cart" rows will reuse `setRowState` and
// the `pending` re-entry guard below — only the worker message and the
// success microcopy differ for that path.
import browser from '../../browser'
import { SPINNER_CSS, spinnerHTML } from './spinner'

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

const REQUEST_TIMEOUT_MS = 15000
const SUCCESS_HOLD_MS = 900

const withTimeout = (promise, ms = REQUEST_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Request timed out' }), ms)),
  ])

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
  .popup .row {
    font-size: 12px; padding: 6px 8px; cursor: pointer; border-radius: 2px;
    display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap;
  }
  .popup .row:hover { background: #f4f4f4; }
  .popup .row .row-icon { display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; flex: 0 0 auto; }
  .popup .row .row-text { flex: 1 1 auto; min-width: 0; }
  .popup .row .row-error { flex: 1 0 100%; font-size: 11px; color: #c63; padding-left: 20px; }
  .popup .row[data-state="loading"] { cursor: progress; }
  .popup .row[data-state="loading"] .row-text { color: #888; }
  .popup .row[data-state="success"] { background: #ecf7ee; }
  .popup .row[data-state="success"] .row-text { color: #1a7d33; }
  .popup .row[data-state="error"] { background: #fbeceb; }
  .popup .row[data-state="error"] .row-text { color: #c63; }
  .popup .empty { font-size: 12px; color: #777; padding: 6px 8px; text-align: center; }
  .popup .new { display: flex; gap: 4px; padding-top: 6px; border-top: 1px solid #eee; margin-top: 6px; align-items: flex-start; }
  .popup .new input { flex: 1; min-width: 0; font-size: 12px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 2px; }
  .popup .new button { font-size: 12px; padding: 4px 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-width: 28px; min-height: 24px; }
  .popup .new button[disabled] { cursor: progress; opacity: 0.7; }
  .popup .new button[data-state="success"] { background: #ecf7ee; color: #1a7d33; }
  .popup .new button[data-state="error"] { background: #fbeceb; color: #c63; }
  .popup .new .create-error { font-size: 11px; color: #c63; padding: 4px 8px 0; flex: 1 0 100%; }
  .popup .status { font-size: 11px; color: #1a7d33; padding: 4px 8px; }
  .popup .error { font-size: 11px; color: #c63; padding: 4px 8px; }
  svg { width: 11px; height: 11px; fill: currentColor; }
${SPINNER_CSS}
`

const CART_ICON = '<svg viewBox="0 0 16 16"><path d="M2 2 H4 L5 5 H14 L13 11 H6 L5 5 M6 13 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M11 13 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>'
const PLUS_ICON = '<svg viewBox="0 0 16 16"><path d="M8 3 v10 M3 8 h10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
const CHECK_ICON = '<svg viewBox="0 0 16 16"><path d="M3 8 l4 4 l6 -8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const WARN_ICON = '<svg viewBox="0 0 16 16"><path d="M8 2 L15 14 H1 Z M8 6 v4 M8 12 v0.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'

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
  const newRow = shadow.querySelector('.new')
  const statusBox = shadow.querySelector('[data-status]')

  // Re-entry guard for in-flight cart requests. Cart rows key by cart id;
  // the create-and-add control keys by '__create__'. Item 009's remove
  // path will reuse this Set with the same cart-id keys.
  const pending = new Set()

  const setStatus = (text, type = 'status') => {
    statusBox.innerHTML = text ? `<div class="${type}">${text}</div>` : ''
    if (text) setTimeout(() => (statusBox.innerHTML = ''), 4000)
  }

  // Builds a cart row with an attached `setRowState(state, errorText?)`
  // method that flips data-state, swaps the leading icon, and shows or
  // hides an inline error message under the row text.
  //
  // Item 009 reuses this helper unchanged for "remove from cart" rows —
  // only the click handler (worker message + success microcopy) differs.
  const makeRow = ({ cartId, name, idleIcon = PLUS_ICON, spinnerColor = '#0687f5' }) => {
    const row = document.createElement('div')
    row.className = 'row'
    row.dataset.cartId = String(cartId)
    row.dataset.state = 'idle'
    row.innerHTML = `<span class="row-icon">${idleIcon}</span><span class="row-text">${escapeHtml(name)}</span>`

    const iconEl = row.querySelector('.row-icon')
    const textEl = row.querySelector('.row-text')

    const renderError = (errorText) => {
      let errorEl = row.querySelector('.row-error')
      if (errorText) {
        if (!errorEl) {
          errorEl = document.createElement('span')
          errorEl.className = 'row-error'
          row.appendChild(errorEl)
        }
        errorEl.textContent = errorText
      } else if (errorEl) {
        errorEl.remove()
      }
    }

    row.setRowState = (state, errorText) => {
      row.dataset.state = state
      if (state === 'loading') iconEl.innerHTML = spinnerHTML(spinnerColor)
      else if (state === 'success') iconEl.innerHTML = CHECK_ICON
      else if (state === 'error') iconEl.innerHTML = WARN_ICON
      else iconEl.innerHTML = idleIcon
      renderError(state === 'error' ? errorText || '' : '')
      // textEl is referenced only to keep the helper's contract obvious;
      // the muted-text class is driven by the [data-state] CSS rule.
      void textEl
    }

    return row
  }

  const setCreateState = (state, errorText) => {
    if (state === 'loading') {
      createBtn.dataset.state = 'loading'
      createBtn.disabled = true
      createBtn.innerHTML = spinnerHTML('#222')
    } else if (state === 'success') {
      createBtn.dataset.state = 'success'
      createBtn.disabled = true
      createBtn.innerHTML = CHECK_ICON
    } else if (state === 'error') {
      createBtn.dataset.state = 'error'
      createBtn.disabled = false
      createBtn.innerHTML = WARN_ICON
    } else {
      delete createBtn.dataset.state
      createBtn.disabled = false
      createBtn.innerHTML = PLUS_ICON
    }
    renderCreateError(state === 'error' ? errorText || '' : '')
  }

  const renderCreateError = (errorText) => {
    let errorEl = newRow.querySelector('.create-error')
    if (errorText) {
      if (!errorEl) {
        errorEl = document.createElement('div')
        errorEl.className = 'create-error'
        newRow.appendChild(errorEl)
      }
      errorEl.textContent = errorText
    } else if (errorEl) {
      errorEl.remove()
    }
  }

  const runAdd = async (row, cartId) => {
    if (pending.has(cartId)) return
    if (row.dataset.state === 'error') row.setRowState('idle')
    pending.add(cartId)
    row.setRowState('loading')
    try {
      const releases = await getReleases()
      const result = await withTimeout(sendToWorker({ type: 'bandcamp:add-to-cart', cartId, releases }))
      if (result?.ok) {
        row.setRowState('success')
        setTimeout(() => {
          if (openHost === host) closeOpen()
        }, SUCCESS_HOLD_MS)
      } else {
        row.setRowState('error', result?.error || 'Failed to add to cart')
      }
    } finally {
      pending.delete(cartId)
    }
  }

  const loadCarts = async () => {
    list.innerHTML = '<div class="empty">Loading carts…</div>'
    const response = await withTimeout(sendToWorker({ type: 'bandcamp:get-carts' }))
    if (!response?.ok) {
      list.innerHTML = `<div class="error">${escapeHtml(response?.error || 'Failed to load carts')}</div>`
      return
    }
    const carts = response.carts || []
    if (carts.length === 0) {
      list.innerHTML = '<div class="empty">No carts yet — create one below.</div>'
      return
    }
    list.innerHTML = ''
    for (const c of carts) {
      const row = makeRow({ cartId: Number(c.id), name: c.name })
      row.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        runAdd(row, Number(c.id))
      })
      list.appendChild(row)
    }
  }

  shadow.querySelector('[data-toggle]').addEventListener('click', async (e) => {
    e.preventDefault()
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
    e.preventDefault()
    e.stopPropagation()
    if (pending.has('__create__')) return
    const name = newInput.value.trim()
    if (!name) return
    pending.add('__create__')
    setCreateState('loading')
    try {
      const response = await withTimeout(sendToWorker({ type: 'bandcamp:create-cart', name }))
      if (!response?.ok) {
        const message = response?.error || 'Failed to create cart'
        setCreateState('error', message)
        setStatus(message, 'error')
        return
      }
      const cartId = response.cart?.id
      if (!cartId) {
        setCreateState('idle')
        newInput.value = ''
        await loadCarts()
        return
      }
      const releases = await getReleases()
      const addResult = await withTimeout(sendToWorker({ type: 'bandcamp:add-to-cart', cartId, releases }))
      if (addResult?.ok) {
        setCreateState('success')
        newInput.value = ''
        setTimeout(() => {
          if (openHost === host) closeOpen()
        }, SUCCESS_HOLD_MS)
      } else {
        setCreateState('error', addResult?.error || 'Created cart but add failed')
      }
    } finally {
      pending.delete('__create__')
    }
  })

  newInput.addEventListener('input', () => {
    if (createBtn.dataset.state === 'error') setCreateState('idle')
  })

  return host
}

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
