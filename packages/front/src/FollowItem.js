import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icon } from '@fortawesome/fontawesome-svg-core/import.macro'
import React, { Component } from 'react'
import ExternalLink from './ExternalLink'
import SpinnerButton from './SpinnerButton'

class FollowItem extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <SpinnerButton
        size="large"
        onClick={this.props.onClick}
        loading={this.props.loading}
        disabled={this.props.disabled}
      >
        <FontAwesomeIcon icon={this.props.following ? 'heart-broken' : 'heart'} />{' '}
        {this.props.following ? 'Unfollow' : 'Follow'}{' '}
        <ExternalLink
          href={this.props.url}
          target="_blank"
          onClick={e => e.stopPropagation()}
          title={'Check details from store'}
        >
          {this.props.title}&nbsp;
        </ExternalLink>{' '}
        on {this.props.storeName}{' '}
        <span aria-hidden="true" className={`store-icon store-icon-${this.props.storeName.toLowerCase()}`} />{' '}
      </SpinnerButton>
    )
  }
}

export default FollowItem
