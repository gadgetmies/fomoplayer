import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

class ExternalLink extends Component {
  static defaultProps = { showIcon: true }
  render() {
    return (
      <a
        onClick={(e) => e.stopPropagation()}
        {...this.props}
        className={`${this.props.className || ''} 'external-link' link`}
        target="_blank"
        {...R.dissoc('children', this.props)}
      >
        {this.props.children}
        &nbsp;
        {this.props.showIcon ? <FontAwesomeIcon icon="external-link" /> : null}
      </a>
    )
  }
}

export default ExternalLink
