import { colors } from 'fomoplayer_shared/theme'

const INDICATOR_ATTR = 'data-fp-heard'

const indicatorSvg = `
<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M6.5 11.5 3 8l1.06-1.06L6.5 9.38l5.44-5.44L13 5z" fill="currentColor"/>
</svg>`

export const renderHeardIndicator = () => {
  const host = document.createElement('span')
  host.setAttribute(INDICATOR_ATTR, '1')
  host.setAttribute('role', 'img')
  host.setAttribute('aria-label', 'Heard in Fomo Player')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: inline-flex; align-items: center; vertical-align: middle; }
      .indicator {
        display: inline-flex; align-items: center; justify-content: center;
        width: 18px; height: 18px;
        border: 1px solid ${colors.brandPrimary};
        border-radius: 50%;
        background: ${colors.brandPrimary};
        color: #fff;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      }
      .indicator svg { width: 12px; height: 12px; display: block; }
    </style>
    <span class="indicator" title="Heard in Fomo Player">${indicatorSvg}</span>
  `
  return host
}

export const hasHeardIndicator = (container) =>
  Boolean(container && container.querySelector(`[${INDICATOR_ATTR}]`))

export const paintHeardIndicators = (containersByBandcampId, lookup) => {
  for (const [bandcampId, container] of containersByBandcampId.entries()) {
    if (!container || !container.isConnected) continue
    if (hasHeardIndicator(container)) continue
    const entry = lookup?.[bandcampId]
    if (!entry || !entry.heard) continue
    container.insertBefore(renderHeardIndicator(), container.firstChild)
  }
}
