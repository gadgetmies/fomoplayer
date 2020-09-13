import React, {Component} from 'react'
import * as R from 'ramda'

const artistNamesToString = R.pipe(R.pluck('name'), R.join(', '))

class TrackTitle extends Component {
  render() {
    return <div className={this.props.className}>
      {artistNamesToString(this.props.artists || [])}
      {` - `}
      {this.props.title}
    </div>
  }
}

export default TrackTitle
