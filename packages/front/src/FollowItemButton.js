import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import React, { Component } from 'react'

class FollowItemButton extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <SpinnerButton
        className="button button-push_button-large button-push_button-primary"
        style={{ margin: 4 }}
        disabled={this.props.disabled}
        loading={this.props.loading}
        onClick={this.props.onClick}
      >
        <FontAwesomeIcon icon="plus" /> Follow {this.props.type}:{' '}
        <span className="pill" style={{ backgroundColor: 'white', color: 'black' }}>
          <span aria-hidden="true" className={`store-icon store-icon-${this.props.storeName}`} /> {this.props.name}
        </span>{' '}
        <a href={this.props.url} target="_blank" onClick={e => e.stopPropagation()} title={'Check details from store'}>
          <FontAwesomeIcon icon="external-link-alt" />
        </a>
      </SpinnerButton>
    )
  }
}

export default FollowItemButton
