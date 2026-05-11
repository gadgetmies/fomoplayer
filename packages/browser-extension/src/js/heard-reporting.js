'use strict'

const HEARD_MESSAGE_TYPE = 'bandcamp:report-heard'

const buildHeardReportMessage = (track) => ({ type: HEARD_MESSAGE_TYPE, track })

const attachHeardReporting = (audioEl, getCurrentTrack, sendMessage) => {
  if (!audioEl || typeof audioEl.addEventListener !== 'function') return () => {}
  const handler = () => {
    const track = getCurrentTrack()
    if (!track) return
    try {
      const result = sendMessage(buildHeardReportMessage(track))
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch (_) {
      // sendMessage threw synchronously — ignore; transient and self-recovers
    }
  }
  audioEl.addEventListener('play', handler)
  return () => audioEl.removeEventListener('play', handler)
}

module.exports = {
  HEARD_MESSAGE_TYPE,
  buildHeardReportMessage,
  attachHeardReporting,
}
