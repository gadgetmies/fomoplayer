import FullScreenPopup from './FullScreenPopup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'
import SpinnerButton from './SpinnerButton'
import { prop } from 'ramda'
import { Link } from 'react-router-dom'

class FollowPopup extends Component {
  constructor(props) {
    super(props)

    this.state = {
      subscribingToLabel: null,
      subscribingToArtist: null,
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
          {this.props.track.remixers.concat(this.props.track.artists).map(artist => {
            const following = this.getFollowingArtist(artist)
            return (
              <SpinnerButton
                loading={this.state.subscribingToArtist === artist.id}
                disabled={this.state.subscribingToArtist}
                key={`artist-${artist.id}`}
                className={'button button-push_button-large button-push_button-primary'}
                onClick={async () => {
                  try {
                    this.setState({ subscribingToArtist: artist.id })
                    await this.props.onFollowArtist(artist.id, !following)
                  } catch (e) {
                    console.error(e)
                  }

                  this.setState({ subscribingToArtist: null })
                }}
              >
                <FontAwesomeIcon icon={`${following ? 'heart-broken' : 'heart'}`} /> {artist.name}
              </SpinnerButton>
            )
          })}
        </div>
        {this.props.track.labels.length === 0 ? null : (
          <>
            <h2>Labels</h2>
            <div className="input-layout">
              {this.props.track.labels.map(label => {
                const following = this.getFollowingLabel(label)
                return (
                  <SpinnerButton
                    loading={this.state.subscribingToLabel === label.id}
                    disabled={this.state.subscribingToLabel}
                    key={`label-${label.id}`}
                    className={'button button-push_button-large button-push_button-primary'}
                    onClick={async () => {
                      try {
                        this.setState({ subscribingToLabel: label.id })
                        await this.props.onFollowLabel(label.id, !following)
                      } catch (e) {
                        console.error(e)
                      }

                      this.setState({ subscribingToLabel: null })
                    }}
                  >
                    <FontAwesomeIcon icon={`${following ? 'heart-broken' : 'heart'}`} /> {label.name}
                  </SpinnerButton>
                )
              })}
            </div>
          </>
        )}
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

  getFollowingArtist(artist) {
    return this.props.follows.artists.find(({ id }) => id === artist.id) !== undefined
  }

  getFollowingLabel(label) {
    return this.props.follows.labels.find(({ id }) => id === label.id) !== undefined
  }
}

export default FollowPopup
