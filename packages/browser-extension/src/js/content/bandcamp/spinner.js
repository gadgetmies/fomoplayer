// Shared spinner used by Fomo Player content-script UIs on bandcamp:
// the cart dropdown (shadow DOM, CSS inlined via STYLE), the per-track /
// release Queue buttons (page DOM), and the embedded player's queue list
// pending row. Kept as one source of truth so the lds-ring keyframes
// don't drift across copies. Ported from packages/front/src/SpinnerButton.css.

export const SPINNER_CSS = `
  .loading-indicator {
    display: inline-block;
    position: relative;
    margin-left: 0.25rem;
  }
  .loading-indicator__small {
    width: 0.7rem;
    height: 0.7rem;
  }
  .loading-indicator div {
    box-sizing: border-box;
    display: block;
    position: absolute;
    width: 100%;
    height: 100%;
    border: 2px solid #fff;
    border-radius: 50%;
    animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
    border-color: #fff transparent transparent transparent;
  }
  .loading-indicator div:nth-child(1) { animation-delay: -0.45s; }
  .loading-indicator div:nth-child(2) { animation-delay: -0.3s; }
  .loading-indicator div:nth-child(3) { animation-delay: -0.15s; }
  @keyframes lds-ring {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`

export const spinnerHTML = (color = '#0687f5') => {
  const style = `border-color: ${color} transparent transparent transparent`
  return (
    `<div class="loading-indicator loading-indicator__small">` +
    `<div style="${style}"></div><div style="${style}"></div><div style="${style}"></div><div style="${style}"></div>` +
    `</div>`
  )
}

// Page-DOM consumers (no shadow DOM) need the keyframes/class definitions
// in a global stylesheet exactly once. This idempotently appends them to
// document.head and is safe to call from any content-script entry point.
const PAGE_STYLE_ID = 'fomoplayer-spinner-style'

export const ensurePageSpinnerStyles = () => {
  if (typeof document === 'undefined') return
  if (document.getElementById(PAGE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PAGE_STYLE_ID
  style.textContent = SPINNER_CSS
  document.head.appendChild(style)
}
