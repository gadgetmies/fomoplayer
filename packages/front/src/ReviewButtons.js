import './ReviewButtons.css'
import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { REVIEW_DECISIONS } from './cartReview'

// Accept / Undecided / Reject for a track of the cart under review, the current state shown pressed. Used in the track
// rows and the player panel. `compact` keeps only the icons (the docked bar and narrow layouts).
const ReviewButtons = ({ state, onDecide, compact = false, className = '', disabled = false }) => (
  <span
    className={`review-buttons ${compact ? 'review-buttons__compact' : ''} ${className}`}
    role="group"
    aria-label="Review"
  >
    {REVIEW_DECISIONS.map(({ state: value, label, icon }) => {
      const pressed = (state ?? null) === value
      return (
        <button
          key={label}
          type="button"
          disabled={disabled}
          aria-pressed={pressed}
          aria-label={label}
          title={label}
          data-testid={`review-${label.toLowerCase()}`}
          className={`button button-push_button button-push_button-small button-push_button-primary review-button review-button__${label.toLowerCase()}`}
          onClick={(e) => {
            e.stopPropagation()
            if (!pressed) onDecide(value)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="button-push_button_icon">
            <FontAwesomeIcon icon={icon} />
          </span>
          {!compact && <span className="button-push_button_label review-button-label">{label}</span>}
        </button>
      )
    })}
  </span>
)

export default ReviewButtons
