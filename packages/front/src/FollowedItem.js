import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icon } from '@fortawesome/fontawesome-svg-core/import.macro'
import React, { Component } from 'react'

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
                  <FontAwesomeIcon icon={icon({ name: 'star', style: 'solid' })} />
                ) : (
                  <FontAwesomeIcon icon={icon({ name: 'star', style: 'regular' })} />
                )}
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
                onClick={e => e.stopPropagation()}
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
