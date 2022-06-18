import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import React, { Component } from 'react'

class FollowItemButton extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div
        style={{ margin: 4, padding: 4, background: 'black', borderRadius: 4, textAlign: 'center' }}
        onClick={this.props.onClick}
      >
        <a
          href={this.props.url}
          target="_blank"
          onClick={e => e.stopPropagation()}
          title={'Check details from store'}
          style={{ position: 'relative', height: 100, width: 100, display: 'block', margin: 'auto' }}
        >
          <img src={this.props.img} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
          <FontAwesomeIcon icon="external-link-alt" style={{ position: 'absolute', right: 5, bottom: 5 }} />
        </a>
        <div style={{ margin: '2px 4px 6px 4px' }}>{this.props.name}</div>
        <SpinnerButton
          className="button button-push_button-small button-push_button-primary"
          loading={this.props.loading}
          disabled={this.props.disabled}
        >
          <span aria-hidden="true" className={`store-icon store-icon-${this.props.storeName}`} /> Follow
        </SpinnerButton>
      </div>
    )
  }
}

export default FollowItemButton
