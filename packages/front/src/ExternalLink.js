import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

class ExternalLink extends Component {
  constructor(props) {
    super(props)
  }

  static defaultProps = { showIcon: true }

  render() {
    return (
      <a
        onClick={e => e.stopPropagation()}
        className={`${this.props.className || ''} external-link link`}
        target="_blank"
        style={{ display: 'flex' }}
        {...R.omit(['children', 'showIcon'], this.props)}
      >
        <span>{this.props.children}</span>
        <span>{this.props.showIcon ? <FontAwesomeIcon icon="square-arrow-up-right" /> : null}</span>
      </a>
    )
  }
}

export default ExternalLink
