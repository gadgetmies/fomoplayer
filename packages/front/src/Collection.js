import SpinnerButton from './SpinnerButton'
import React from 'react'

class Collection extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      markingHeard: false
    }
  }

  render() {
    return (
      <div class="collection-details" style={{ padding: 4 }}>
        <div className="collection-details-item">Total: {this.props.totalTracks}</div>
        <div className="collection-details-item">New: {this.props.newTracks}</div>
        <SpinnerButton
          size={'small'}
          loading={this.state.markingHeard}
          onClick={async () => {
            this.setState({ markingHeard: true })
            await this.props.onMarkAllHeardClicked()
            this.setState({ markingHeard: false })
          }}
          label={'Mark all heard'}
          loadingLabel={'Marking all heard'}
        />
      </div>
    )
  }
}

export default Collection
