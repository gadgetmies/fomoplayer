import FullScreenPopup from './FullScreenPopup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'
import SpinnerButton from './SpinnerButton'
import { Link } from 'react-router-dom'

const joinStringList = (list) =>
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
      ignoringRelease: null,
      ignoringArtistOnLabels: null,
      ignoredLabels: new Set(),
      ignoredArtists: new Set(),
      ignoredReleases: new Set(),
      ignoredArtistsOnLabels: new Set(),
      refreshingList: false,
    }
  }

  toggleIgnoreByArtistOnLabelInfo() {
    this.setState({ ignoreByArtistOnLabelInfoVisible: !this.state.ignoreByArtistOnLabelInfoVisible })
  }

  render() {
    if (this.props.track === undefined) {
      return null
    }

    const releases = this.props.track.releases
    const artists = this.props.track.artists.concat(this.props.track.remixers)
    return (
      <FullScreenPopup title="Ignore" {...this.props}>
        {this.props.track.labels.length === 0 ? null : (
          <>
            <h2>
              Artist on labels{' '}
              <button onClick={this.toggleIgnoreByArtistOnLabelInfo.bind(this)}>
                <FontAwesomeIcon icon="info-circle" />
              </button>
            </h2>
            <p style={{ display: this.state.ignoreByArtistOnLabelInfoVisible ? 'block' : 'none' }}>
              Ignoring an artist by labels will ignore all the tracks from the given artist on the given labels. When
              ignored, such tracks will no longer appear in the tracks list. You can remove the ignore from the settings
              view.
            </p>
            <div className="input-layout">
              {artists.map((artist) => {
                const labelIds = this.props.track.labels.map(({ id }) => id)
                const idString = `${artist.id}-${labelIds.join(',')}`
                const isIgnored = this.state.ignoredArtistsOnLabels.has(idString)
                return (
                  <SpinnerButton
                    loading={this.state.ignoringArtistOnLabels === idString}
                    disabled={this.state.ignoringArtistOnLabels || isIgnored}
                    key={`artist-${artist.id}`}
                    title={`Ignore ${artist.name} on ${joinStringList(this.props.track.labels)}`}
                    size={'large'}
                    icon={'ban'}
                    className={`${isIgnored ? 'ignored' : ''}`}
                    onClick={async () => {
                      this.setState({ ignoringArtistOnLabel: idString })

                      try {
                        await this.props.onIgnoreArtistOnLabels(artist.id, labelIds, true)
                        this.setState({
                          ignoredArtistsOnLabels: this.state.ignoredArtistsOnLabels.add(idString),
                        })
                      } catch (e) {
                        console.error(e)
                      }

                      this.setState({ ignoringArtistOnLabel: null })
                    }}
                  >
                    {artist.name} on {joinStringList(this.props.track.labels)}
                  </SpinnerButton>
                )
              })}
            </div>
          </>
        )}
        {releases.length === 0 ? null : (
          <>
            <h2>Release</h2>
            <div className="input-layout">
              {this.props.track.releases.map((release) => (
                <SpinnerButton
                  loading={this.state.ignoringRelease === release.id}
                  disabled={this.state.ignoringRelease || this.state.ignoredReleases.has(release.id)}
                  title={`Ignore ${release.name}`}
                  key={`artist-${release.id}`}
                  size={'large'}
                  icon={'ban'}
                  className={`${this.state.ignoredReleases.has(release.id) ? 'ignored' : ''}`}
                  onClick={async () => {
                    this.setState({ ignoringRelease: release.id })

                    try {
                      await this.props.onIgnoreRelease(release.id, true)
                      this.setState({
                        ignoredReleases: this.state.ignoredReleases.add(release.id),
                      })
                    } catch (e) {
                      console.error(e)
                    }

                    this.setState({ ignoringRelease: null })
                  }}
                >
                  {release.name}
                </SpinnerButton>
              ))}
            </div>
          </>
        )}
        <h2>Artists</h2>
        <div className="input-layout">
          {this.props.track.artists.map((artist) => (
            <SpinnerButton
              loading={this.state.ignoringArtist === artist.id}
              disabled={this.state.ignoringArtist || this.state.ignoredArtists.has(artist.id)}
              title={`Ignore ${artist.name}`}
              key={`artist-${artist.id}`}
              size={'large'}
              icon={'ban'}
              className={`${this.state.ignoredArtists.has(artist.id) ? 'ignored' : ''}`}
              onClick={async () => {
                this.setState({ ignoringArtist: artist.id })

                try {
                  await this.props.onIgnoreArtist(artist.id, true)
                  this.setState({ ignoredArtists: this.state.ignoredArtists.add(artist.id) })
                } catch (e) {
                  console.error(e)
                }

                this.setState({ ignoringArtist: null })
              }}
            >
              {artist.name}
            </SpinnerButton>
          ))}
        </div>
        {this.props.track.labels.length === 0 ? null : (
          <>
            <h2>Labels</h2>
            <div className="input-layout">
              {this.props.track.labels.map((label) => (
                <SpinnerButton
                  loading={this.state.ignoringLabel === label.id}
                  disabled={this.state.ignoringLabel || this.state.ignoredLabels.has(label.id)}
                  title={`Ignore ${label.name}`}
                  key={`label-${label.id}`}
                  size={'large'}
                  icon={'ban'}
                  className={`${this.state.ignoredLabels.has(label.id) ? 'ignored' : ''}`}
                  onClick={async () => {
                    this.setState({ ignoringLabel: label.id })

                    try {
                      await this.props.onIgnoreLabel(label.id, true)
                      this.setState({ ignoredLabels: this.state.ignoredLabels.add(label.id) })
                    } catch (e) {
                      console.log(e)
                    }

                    this.setState({ ignoringLabel: null })
                  }}
                >
                  {label.name}
                </SpinnerButton>
              ))}
            </div>
          </>
        )}
        <p>
          <FontAwesomeIcon icon={'exclamation-circle'} /> NOTE: The ignored state of the artists and labels is not
          updated from the server and thus some of the artists and labels might already be ignored. Also note that you
          need to refresh the track list in the player manually after ignoring.
        </p>
        <p>
          <Link
            className="no-style-link"
            to="/settings"
            onClick={() => {
              this.props.onCloseClicked()
            }}
          >
            <Link to={'/settings/following'}>Edit the ignores in settings</Link>
          </Link>
        </p>
        <br />
        <SpinnerButton
          loading={this.state.refreshingList}
          disabled={this.state.refreshingList}
          size={'large'}
          onClick={async () => {
            this.setState({ refreshingList: true })
            await this.props.onRefreshAndCloseClicked()
            this.setState({ refreshingList: false })
          }}
          style={{ margin: 'auto', display: 'block' }}
        >
          Refresh list and close popup
        </SpinnerButton>
      </FullScreenPopup>
    )
  }
}

export default IgnorePopup
