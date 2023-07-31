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
        className={`${this.props.className || ''} 'external-link' link`}
        target="_blank"
        {...R.omit(['children', 'showIcon'], this.props)}
      >
        {this.props.children}
        &nbsp;
        {this.props.showIcon ? <FontAwesomeIcon icon="external-link-alt" /> : null}
      </a>
    )
  }
}

export default ExternalLink
