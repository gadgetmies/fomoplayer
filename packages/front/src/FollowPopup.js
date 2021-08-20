import FullScreenPopup from './FullScreenPopup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'
import SpinnerButton from './SpinnerButton'
import { prop } from 'ramda'
import { Link } from 'react-router-dom'

class FollowPopup extends Component {
  constructor(props) {
    super(props)

    console.log({ props })

    this.state = {
      subscribingToLabel: null,
      subscribingToArtist: null,
      followedLabels: new Set(props.follows.labels.map(prop('id'))),
      followedArtists: new Set(props.follows.artists.map(prop('id'))),
      refreshingList: false
    }
  }

  render() {
    if (this.props.track === undefined) {
      return null
    }

    return (
      <FullScreenPopup title="Follow / unfollow" {...this.props}>
        <h2>Artists</h2>
        <div className="input-layout">
          {this.props.track.remixers.concat(this.props.track.artists).map(artist => (
            <SpinnerButton
              loading={this.state.subscribingToArtist === artist.id}
              disabled={this.state.subscribingToArtist}
              key={`artist-${artist.id}`}
              className={'button button-push_button-large button-push_button-primary'}
              onClick={async () => {
                const followedArtists = this.state.followedArtists

                try {
                  const following = followedArtists.has(artist.id)
                  this.setState({ subscribingToArtist: artist.id })
                  await this.props.onFollowArtist(artist.id, !following)
                  followedArtists[following ? 'delete' : 'add'](artist.id)
                } catch (e) {
                  console.error(e)
                }

                this.setState({ followedArtists, subscribingToArtist: null })
              }}
            >
              <FontAwesomeIcon icon={`${this.state.followedArtists.has(artist.id) ? 'times-circle' : 'heart'}`} />{' '}
              {artist.name}
            </SpinnerButton>
          ))}
        </div>
        {this.props.track.labels.length === 0 ? null : (
          <>
            <h2>Labels</h2>
            <div className="input-layout">
              {this.props.track.labels.map(label => (
                <SpinnerButton
                  loading={this.state.subscribingToLabel === label.id}
                  disabled={this.state.subscribingToLabel}
                  key={`label-${label.id}`}
                  className={'button button-push_button-large button-push_button-primary'}
                  onClick={async () => {
                    const followedLabels = this.state.followedLabels

                    try {
                      const following = followedLabels.has(label.id)
                      this.setState({ subscribingToLabel: label.id })
                      await this.props.onFollowLabel(label.id, !following)
                      followedLabels[following ? 'delete' : 'add'](label.id)
                    } catch (e) {
                      console.error(e)
                    }

                    this.setState({ followedLabels, subscribingToLabel: null })
                  }}
                >
                  <FontAwesomeIcon icon={`${this.state.followedLabels.has(label.id) ? 'times-circle' : 'heart'}`} />{' '}
                  {label.name}
                </SpinnerButton>
              ))}
            </div>
          </>
        )}
        <p>
          NOTE: The followed state of the artists and labels is not updated from the server and thus some of the artists
          and labels might already be followed. Also note that you need to refresh the track list in the player manually
          after following.
        </p>
        <p>
          <Link
            className="no-style-link"
            to="/settings"
            onClick={() => {
              this.props.onCloseClicked()
            }}
          >
            <button className={'button button-push_button-large button-push_button-primary'}>
              Edit the follows in settings
            </button>
          </Link>
        </p>
        <SpinnerButton
          loading={this.state.refreshingList}
          disabled={this.state.refreshingList}
          type="submit"
          className="button button-push_button-large button-push_button-primary"
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

export default FollowPopup
