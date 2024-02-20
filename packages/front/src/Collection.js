import './Collection.css'
import React from 'react'

class Collection extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div className="collection-details" style={{ padding: 4 }}>
        <div className="collection-details-item">Total: {this.props.totalTracks}</div>
        <div className="collection-details-item">New: {this.props.newTracks}</div>
      </div>
    )
  }
}

export default Collection
