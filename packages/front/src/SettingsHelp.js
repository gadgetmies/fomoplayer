import React, { Component } from 'react'
import Help from './Help'

export class SettingsHelp extends Component {
  static steps = {
    Following: {
      target: '[data-help-id=following-tab]',
      placement: 'bottom',
      content: (
        <>
          <p>
            In the Following tab you can set from which artists and labels track get added to your collection (i.e.
            tracks that will appear in the new tracks list). To ensure you notice all the tracks from your favorite
            artists and labels, you can star those in order for their new tracks to appear at the top of the list.
          </p>
          {/*
          <p>
            You can also follow "playlists" on different services by pasting the address (URL) to the page that holds a list of
            tracks to the search bar. Currently supported pages are:<br/>
            <strong>Beatport:</strong> Any (public i.e. visible without login) page with tracks on it should work such as genre top 100 lists.<br/>
            <strong>Spotify:</strong> Public playlist addresses (URL). You can e.g. follow your Discover Weekly (please ensure first that it is public though).<br/>
            <strong>Bandcamp:</strong> Any (public i.e. visible without login) page with releases or tracks should work, such as genre highlights (e.g. https://bandcamp.com/tag/drum-bass) and users' collections (e.g. https://bandcamp.com/elysion)
          </p>*/}
        </>
      )
    },
    Sorting: {
      target: '[data-help-id=sorting-tab]',
      placement: 'bottom',
      content: (
        <p>
          In the sorting tab you can control how the tracks are sorted in the new tracks list. By adjusting the
          parameters you can e.g. focus less on the newest tracks by lowering the penalties or ensure the followed
          artists and labels appear higher in the list by increasing the bonuses. By marking tracks purchased (last item
          in the add to cart dropdown) and increasing the related bonuses, you can ensure the new releases from the
          artists and labels appear higher in the list.
        </p>
      )
    },
    Carts: {
      target: '[data-help-id=carts-tab]',
      placement: 'bottom',
      content: (
        <p>
          You can collect interesting tracks to different carts in the service. In the carts tab, you can add and remove
          and edit the carts. In addition to this, you can enable the sharing of your carts. This way you can share the
          cart address to others to show them the tracks you have discovered. You can also synchronise the playlist to
          Spotify (enabling authorization in the Authorizations tab required) in order to e.g. preview the complete
          tracks before purchasing.
        </p>
      )
    },
    Notifications: {
      target: '[data-help-id=notifications-tab]',
      placement: 'bottom',
      content: (
        <p>
          If you bump into an unreleased track e.g. in a podcast, you can create a search notification in the
          notifications tab or in the search, to receive an email notification when there are new tracks matching the
          search. In order to enable this functionality, you need to first confirm your email address.
        </p>
      )
    },
    Ignores: {
      target: '[data-help-id=ignores-tab]',
      placement: 'bottom',
      content: (
        <p>
          Due to limited artist names and human imagination, multiple artists share the same name on various platforms.
          Some services distinguish between them (e.g., Spotify), while others don't (e.g., Beatport). This may lead to
          unwanted tracks in your new tracks list. Fortunately, artists with the same name usually don't release tracks
          on the same label. To reduce noise, use the ignore button to filter artists by labels you are not interested
          in. Manage these preferences in the Ignores tab.
        </p>
      )
    },
    Collection: {
      target: '[data-help-id=collection-tab]',
      placement: 'bottom',
      content: (
        <p>
          The Collection tab if for house keeping. The service adds tracks that are max 2 years old to the collections
          by default. If however you are only interested in newer tracks, you can use this tab to ignore the older
          tracks. Ignoring the older tracks affects only the list of new tracks, not e.g. the cart contents.
        </p>
      )
    },
    Authorizations: {
      target: '[data-help-id=integrations-tab]',
      placement: 'bottom',
      content: (
        <p>
          In order to synchronise tracks to Spotify, you will need to authorise the service to give it access rights to
          your Spotify account for creating playlists and synchronising the cart contents with playlists. For safety
          reasons the service will only modify playlists it has created.
        </p>
      ),
      locale: { last: 'Done' }
    }
  }

  constructor(props) {
    super(props)
  }

  render() {
    return (
      <Help
        steps={SettingsHelp.steps}
        active={this.props.active}
        onStateChanged={this.props.onStateChanged}
        onActiveChanged={this.props.onActiveChanged}
      ></Help>
    )
  }
}
