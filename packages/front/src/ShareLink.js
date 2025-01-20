import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

class ShareLink extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <a
        href={this.props.href}
        target={'_blank'}
        className={`pill-link pill pill-${this.props.size || 'small'}`}
        style={{ width: '100%', margin: 0, marginBottom: 4, ...this.props.style }}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {this.props.icon} <span className={'pill-button-label'}>{this.props.label}</span>
      </a>
    )
  }
}

export default ShareLink
