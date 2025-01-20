import * as R from 'ramda'
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
      subscribingToAllStoreLabels: false,
      subscribingToStoreArtists: false,
      refreshingList: false,
    }
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.track !== this.props.track) {
      const [artistDetails, labelDetails] = await Promise.all([
        Promise.all(
          this.props.track?.artists
            .concat(this.props.track.remixers)
            .map(({ id }) => id)
            .map((id) => requestJSONwithCredentials({ url: `${apiURL}/artists/${id}` })),
        ),
        Promise.all(
          this.props.track?.labels
            .map(({ id }) => id)
            .map((id) => requestJSONwithCredentials({ url: `${apiURL}/labels/${id}` })),
        ),
      ])

      this.setState({ artistDetails: R.uniqBy(R.prop('id'), artistDetails) || [], labelDetails: labelDetails || [] })
    }
  }

  render() {
    if (this.props.track === undefined) {
      return null
    }

    const artistsNotFollowed = this.state.artistDetails?.flatMap((artist) =>
      artist.stores
        .filter(R.prop('url'))
        .filter(({ id }) => !this.getFollowingArtist(id))
        .map(({ url, id: storeId }) => ({ url, storeId, name: artist.name })),
    )

    const labelsNotFollowed = this.state.labelDetails?.flatMap((label) =>
      label.stores
        .filter(R.prop('url'))
        .filter(({ id }) => !this.getFollowingLabel(id))
        .map(({ url, id: storeId }) => ({ url, storeId, name: label.name })),
    )

    return (
      <FullScreenPopup title="Follow / unfollow" {...this.props}>
        <h2>Artists</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {!this.state.artistDetails ? (
            <>
              <Spinner color="#000" size="large" /> Loading...
            </>
          ) : (
            this.state.artistDetails.map((artist) => {
              return artist.stores.filter(R.prop('url')).map(({ url, id, store: { name: storeName } }) => {
                const following = this.getFollowingArtist(id)
                const subscribing = this.state.subscribingToStoreArtist === id
                return (
                  <FollowItem
                    key={url}
                    title={artist.name}
                    storeName={storeName}
                    url={url}
                    following={following}
                    loading={subscribing}
                    disabled={this.state.subscribingToStoreArtist || this.state.subscribingToAllStoreArtists}
                    onClick={async () => {
                      this.setState({ subscribingToStoreArtist: id })

                      try {
                        await this.props.onFollowStoreArtist(id, url, artist.name, !following)
                      } catch (e) {
                        console.error('Following store artist failed', e)
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
        <div style={{ paddingTop: '16px' }}>
          <SpinnerButton
            icon={'heart'}
            size="large"
            loading={this.state.subscribingToAllStoreArtists}
            disabled={
              this.state.subscribingToAllStoreArtists ||
              artistsNotFollowed?.length === 0 ||
              this.state.subscribingToStoreArtist
            }
            onClick={async () => {
              this.setState({ subscribingToAllStoreArtists: true })
              await Promise.all(
                artistsNotFollowed.map(({ url, storeId, name }) =>
                  this.props.onFollowStoreArtist(storeId, url, name, true),
                ),
              )
              this.setState({ subscribingToAllStoreArtists: false })
            }}
          >
            Follow all artists on all stores
          </SpinnerButton>
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
                this.state.labelDetails.map((label) => {
                  return label.stores.filter(R.prop('url')).map(({ url, id, store: { name: storeName } }) => {
                    const following = this.getFollowingLabel(id)
                    return (
                      <FollowItem
                        key={url}
                        title={label.name}
                        storeName={storeName}
                        url={url}
                        following={following}
                        loading={this.state.subscribingToStoreLabel === id}
                        disabled={this.state.subscribingToStoreLabel || this.state.subscribingToAllStoreLabels}
                        onClick={async () => {
                          this.setState({ subscribingToAllStoreLabel: id })
                          const following = this.getFollowingLabel(id)

                          try {
                            await this.props.onFollowStoreLabel(id, url, label.name, !following)
                          } catch (e) {
                            console.error('Following store artist failed', e)
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
            <div style={{ paddingTop: '16px' }}>
              <SpinnerButton
                icon={'heart'}
                size="large"
                loading={this.state.subscribingToAllStoreLabels}
                disabled={
                  this.state.subscribingToAllStoreLabels ||
                  labelsNotFollowed?.length === 0 ||
                  this.state.subscribingToStoreLabel
                }
                onClick={async () => {
                  this.setState({ subscribingToAllStoreLabels: true })
                  await Promise.all(
                    labelsNotFollowed.map(({ url, storeId, name }) =>
                      this.props.onFollowStoreLabel(storeId, url, name, true),
                    ),
                  )
                  this.setState({ subscribingToAllStoreLabels: false })
                }}
              >
                Follow all artists on all stores
              </SpinnerButton>
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
