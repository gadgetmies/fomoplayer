import FullScreenPopup from './FullScreenPopup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'
import SpinnerButton from './SpinnerButton'
import { Link } from 'react-router-dom'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import Spinner from './Spinner'
import FollowItem from './FollowItem'

class FollowPopup extends Component {
  constructor(props) {
    super(props)

    this.state = {
      subscribingToStoreLabel: null,
      subscribingToStoreArtist: null,
      refreshingList: false
    }
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.track !== this.props.track) {
      const [artistDetails, labelDetails] = await Promise.all([
        Promise.all(
          this.props.track?.artists
            .concat(this.props.track.remixers)
            .map(({ id }) => id)
            .map(id => requestJSONwithCredentials({ url: `${apiURL}/artists/${id}` }))
        ),
        Promise.all(
          this.props.track?.labels
            .map(({ id }) => id)
            .map(id => requestJSONwithCredentials({ url: `${apiURL}/labels/${id}` }))
        )
      ])

      this.setState({ artistDetails: artistDetails || [], labelDetails: labelDetails || [] })
    }
  }

  render() {
    if (this.props.track === undefined) {
      return null
    }

    return (
      <FullScreenPopup title="Follow / unfollow" {...this.props}>
        <h2>Artists</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {!this.state.labelDetails ? (
            <>
              <Spinner color="#000" size="large" /> Loading...
            </>
          ) : (
            this.state.artistDetails.map(artist => {
              return artist.stores.map(({ url, id, store: { name: storeName } }) => {
                const following = this.getFollowingArtist(id)
                const subscribing = this.state.subscribingToStoreArtist === id
                console.log('render', { id, following, subscribing })
                return (
                  <FollowItem
                    key={url}
                    title={artist.name}
                    storeName={storeName}
                    url={url}
                    following={following}
                    loading={subscribing}
                    disabled={this.state.subscribingToStoreArtist}
                    onClick={async () => {
                      this.setState({ subscribingToStoreArtist: id })

                      try {
                        await this.props.onFollowStoreArtist(id, url, artist.name, !following)
                      } catch (e) {
                        console.error('Ignoring store artist failed', e)
                        throw e
                      }

                      this.setState({ subscribingToStoreArtist: null })
                    }}
                  />
                )
              })
            })
          )}
        </div>
        {this.state.labelDetails?.length === 0 ? null : (
          <>
            <h2>Labels</h2>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {!this.state.labelDetails ? (
                <>
                  <Spinner color="#000" size="large" /> Loading...
                </>
              ) : (
                this.state.labelDetails.map(label => {
                  return label.stores.map(({ url, id, store: { name: storeName } }) => {
                    const following = this.getFollowingLabel(id)
                    return (
                      <FollowItem
                        key={url}
                        title={label.name}
                        storeName={storeName}
                        url={url}
                        following={following}
                        loading={this.state.subscribingToStoreLabel === id}
                        disabled={this.state.subscribingToStoreLabel}
                        onClick={async () => {
                          this.setState({ subscribingToStoreLabel: id })

                          try {
                            await this.props.onFollowStoreLabel(id, url, label.name, !following)
                          } catch (e) {
                            console.error('Ignoring store artist failed', e)
                            throw e
                          }

                          this.setState({ subscribingToStoreLabel: null })
                        }}
                      />
                    )
                  })
                })
              )}
            </div>
          </>
        )}
        <p>
          <Link
            onClick={() => {
              this.props.onCloseClicked()
            }}
            to={'/settings/following'}
          >
            Edit the follows in settings
          </Link>
        </p>
        <p>
          <FontAwesomeIcon icon={'exclamation-circle'} /> NOTE: Unfollowing an artist or label does not remove the
          artists or labels tracks from the collection, but instead only prevents any future tracks from being added to
          the collection.
        </p>
        <br />
        <SpinnerButton
          loading={this.state.refreshingList}
          disabled={this.state.refreshingList}
          type="submit"
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

  getFollowingArtist(id) {
    return this.props.follows.artists.find(({ storeArtistId }) => storeArtistId === id) !== undefined
  }

  getFollowingLabel(id) {
    return this.props.follows.labels.find(({ storeLabelId }) => storeLabelId === id) !== undefined
  }
}

export default FollowPopup
