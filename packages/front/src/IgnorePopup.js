import FullScreenPopup from './FullScreenPopup'
import FontAwesome from 'react-fontawesome'
import React, { Component } from 'react'
import SpinnerButton from './SpinnerButton'

const joinStringList = list =>
  list.reduce((acc, { name }, i, array) => {
    return acc + (i === 0 ? '' : i === array.length - 1 ? ' & ' : ', ') + name
  }, '')

class IgnorePopup extends Component {
  constructor(props) {
    super(props)

    this.state = {
      ignoreByArtistOnLabelInfoVisible: false,
      ignoringLabel: null,
      ignoringArtist: null,
      ignoringArtistOnLabels: null,
      ignoredLabels: new Set(),
      ignoredArtists: new Set(),
      ignoredArtistsOnLabels: new Set()
    }
  }

  toggleIgnoreByArtistOnLabelInfo() {
    this.setState({ ignoreByArtistOnLabelInfoVisible: !this.state.ignoreByArtistOnLabelInfoVisible })
  }

  render() {
    return this.props.track === undefined ? null : (
      <FullScreenPopup title="Ignore" {...this.props}>
        <h2>
          Artist on labels{' '}
          <button onClick={this.toggleIgnoreByArtistOnLabelInfo.bind(this)}>
            <FontAwesome name="info-circle" />
          </button>
        </h2>
        <p style={{ display: this.state.ignoreByArtistOnLabelInfoVisible ? 'block' : 'none' }}>
          Ignoring an artist by labels will ignore all the tracks from the given artist on the given labels. When
          ignored, such tracks will no longer appear in the tracks list. You can remove the ignore from the settings
          view.
        </p>
        <div className="input-layout">
          {this.props.track.artists.map(artist => {
            const labelIds = this.props.track.labels.map(({ id }) => id)
            const idString = `${artist.id}-${labelIds.join(',')}`
            return (
              <SpinnerButton
                loading={this.state.ignoringArtistOnLabels === idString}
                disabled={this.state.ignoringArtistOnLabels || this.state.ignoredArtistsOnLabels.has(idString)}
                key={`artist-${artist.id}`}
                className={'button button-push_button-large button-push_button-primary'}
                onClick={async () => {
                  this.setState({ ignoringArtistOnLabel: idString })
                  await this.props.onIgnoreArtistOnLabels(artist.id, labelIds)
                  this.setState({
                    ignoredArtistsOnLabels: this.state.ignoredArtistsOnLabels.add(idString)
                  })
                }}
              >
                <FontAwesome name="ban" /> {artist.name} on {joinStringList(this.props.track.labels)}
              </SpinnerButton>
            )
          })}
        </div>
        <h2>Artists</h2>
        <div className="input-layout">
          {this.props.track.artists.map(artist => (
            <SpinnerButton
              loading={this.state.ignoringArtist === artist.id}
              disabled={this.state.ignoringArtist || this.state.ignoredArtists.has(artist.id)}
              key={`artist-${artist.id}`}
              className={'button button-push_button-large button-push_button-primary'}
              onClick={async () => {
                this.setState({ ignoringArtist: artist.id })
                await this.props.onIgnoreArtist(artist.id)
                this.setState({ ignoredArtists: this.state.ignoredArtists.add(artist.id), ignoringArtist: null })
              }}
            >
              <FontAwesome name="ban" /> {artist.name}
            </SpinnerButton>
          ))}
        </div>
        <h2>Labels</h2>
        <div className="input-layout">
          {this.props.track.labels.map(label => (
            <SpinnerButton
              loading={this.state.ignoringLabel === label.id}
              disabled={this.state.ignoringLabel || this.state.ignoredLabels.has(label.id)}
              key={`label-${label.id}`}
              className={'button button-push_button-large button-push_button-primary'}
              onClick={async () => {
                this.setState({ ignoringLabel: label.id })
                await this.props.onIgnoreLabel(label.id)
                this.setState({ ignoredLabels: this.state.ignoredLabels.add(label.id), ignoringLabel: null })
              }}
            >
              <FontAwesome name="ban" /> {label.name}
            </SpinnerButton>
          ))}
        </div>
        <p>
          NOTE: The ignored state of the artists and labels is not updated from the server and thus some of the artists
          and labels might already be ignored. Also note that you need to refresh the track list in the player manually
          after ignoring.
        </p>
        <button
          type="submit"
          className="button button-push_button-large button-push_button-primary"
          onClick={this.props.onCloseAndRefreshClicked}
          style={{ margin: 'auto', display: 'block' }}
        >
          Close popup and refresh list
        </button>
      </FullScreenPopup>
    )
  }
}

export default IgnorePopup
