import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons'
import React, { Component } from 'react'
import './FollowedItem.css'

class FollowedItem extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <span className="button pill pill-button">
        <span className="pill-button-contents">
          <>
            <span aria-hidden="true" className={`store-icon store-icon-${this.props.storeName.toLowerCase()}`} />{' '}
          </>
          {this.props.title}{' '}
          {this.props.onStarClick && (
            <>
              <button
                disabled={this.props.disabled}
                onClick={this.props.onStarClick}
                title={`Star "${this.props.title}" on ${this.props.storeName}`}
                data-onboarding-id="star-button"
              >
                {this.props.starred ? (
                  <FontAwesomeIcon icon={faStar} />
                ) : (
                  <FontAwesomeIcon icon={faStarRegular} />
                )}
              </button>{' '}
            </>
          )}
          {this.props.onNotifyClick && (
            <>
              {/* Shows the current state; on hover it shows the state a click switches to */}
              <button
                className={`followed-item_bell${this.props.notifyOn ? ' followed-item_bell--on' : ''}`}
                disabled={this.props.disabled || this.props.notifyDisabled}
                onClick={this.props.onNotifyClick}
                aria-pressed={this.props.notifyOn ? 'true' : 'false'}
                aria-label={`Notify about new tracks from "${this.props.title}" on ${this.props.storeName}`}
                title={
                  this.props.notifyDisabledReason ||
                  (this.props.notifyOn
                    ? `Stop notifying about new tracks from "${this.props.title}"`
                    : `Notify about new tracks from "${this.props.title}"`)
                }
              >
                <FontAwesomeIcon
                  className="followed-item_bell-current"
                  icon={this.props.notifyOn ? 'bell' : 'bell-slash'}
                />
                <FontAwesomeIcon
                  className="followed-item_bell-next"
                  icon={this.props.notifyOn ? 'bell-slash' : 'bell'}
                />
              </button>{' '}
            </>
          )}
          <button
            disabled={this.props.disabled}
            onClick={this.props.onUnfollowClick}
            data-onboarding-id="unfollow-button"
          >
            <FontAwesomeIcon icon="times-circle" />{' '}
            {this.props.url && (
              <a
                href={this.props.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={'Check details from store'}
              >
                <FontAwesomeIcon icon="external-link-alt" />
              </a>
            )}
          </button>
        </span>
      </span>
    )
  }
}

export default FollowedItem
