import './UndoNotice.css'
import React, { useEffect, useRef } from 'react'

const NOTICE_SECONDS = 8

// A one-line notice under the cart bar, with Undo when the action can be undone. It goes away by itself after a few
// seconds, or when Undo or the close button is pressed.
const UndoNotice = ({ notice, onDismiss }) => {
  // The parent passes a new callback on every render; the timer restarts only for a new notice.
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => dismiss.current(notice.id), NOTICE_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [notice])

  if (!notice) return null
  return (
    <div className="undo-notice" role="status" data-testid="undo-notice">
      <span className="undo-notice-message">{notice.message}</span>
      {notice.onUndo && (
        <button
          type="button"
          className="button button-push_button button-push_button-small button-push_button-primary"
          data-testid="undo-notice-undo"
          onClick={async () => {
            onDismiss(notice.id)
            await notice.onUndo()
          }}
        >
          Undo
        </button>
      )}
      <button type="button" className="undo-notice-close" aria-label="Close" onClick={() => onDismiss(notice.id)}>
        ×
      </button>
    </div>
  )
}

export default UndoNotice
