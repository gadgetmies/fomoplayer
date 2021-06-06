import React, { Component } from 'react'
import * as R from 'ramda'

export const artistNamesToString = R.pipe(R.pluck('name'), R.join(', '))

class TrackTitle extends Component {
  render() {
    const renderContent = this.props.artists && this.props.title
    return (
      <div className={this.props.className}>
        {renderContent ? (
          <>
            {artistNamesToString(this.props.artists || [])}
            {' - '}
            {this.props.title}
          </>
        ) : (
          <div>&nbsp;</div>
        )}
      </div>
    )
  }
}

export default TrackTitle
