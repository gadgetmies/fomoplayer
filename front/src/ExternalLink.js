import React, { Component } from 'react'
import * as R from 'ramda'
import FontAwesome from 'react-fontawesome'

class ExternalLink extends Component {
  onClick() {}
  render() {
    return (
      <a
        className={`${this.props.className || ''} external-link link`}
        target='_blank'
        {...(R.dissoc('children', this.props))}
      >
        {this.props.children}&nbsp;
        <FontAwesome name="external-link"/>
      </a>
    )
  }
}

export default ExternalLink
