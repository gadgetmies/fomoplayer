import React, { Component } from 'react'
import Help from './Help'

export class PlayerHelp extends Component {
  static steps = {
    Following: {
      target: '[data-help-id=new-tracks]',
      placement: 'bottom',
      content: (
        <p>
          This is the default and main view in the application listing the new unheard tracks sorted by relevance (i.e.
          using the bonuses and penalties in the settings).
        </p>
      ),
    },
    Sorting: {
      target: '[data-help-id=recently-added-tracks]',
      placement: 'bottom',
      content: (
        <p>
          In case you want to see the latest tracks added to your collection sorted only by the time those tracks were
          added to the collection, you can use the recently added tab.
        </p>
      ),
    },
    Carts: {
      target: '[data-help-id=recently-played-tracks]',
      placement: 'bottom',
      content: (
        <p>
          In case you miss some track for one reason or another (e.g. forget the player to play through tracks in the
          background), you can get back to them using the recently played tab.
        </p>
      ),
    },
    Notifications: {
      target: '[data-help-id=carts]',
      placement: 'bottom',
      content: <p>Manage the tracks you've added to your carts in the carts tab.</p>,
    },
    Ignores: {
      target: '[data-help-id=search]',
      placement: 'bottom',
      content: (
        <p>
          Search for tracks and subscribe to email notifications when new results for the given search term are added,
          using the search tab.
        </p>
      ),
    },
    Collection: {
      target: '[data-help-id=add-to-default-cart]',
      placement: 'bottom',
      content: <p>To quickly add a track to your default cart, you can click the plus button next to the timeline.</p>,
    },
    Authorizations: {
      target: '[data-help-id=keyboard-shortcuts]',
      placement: 'bottom',
      content: (
        <p>
          The player can be controlled using media keys on your keyboard even when the player is running in the
          background. To make the browsing experience smoother, the fast forward and rewind buttons do not skip complete
          tracks, but instead seek the track back and forward. To jump to the next / previous track, you need to double
          click those keys. There are also other useful shortcuts to make the use more efficient. You can see these by
          hovering the keyboard icon in the top bar.
        </p>
      ),
      locale: { last: 'Done' },
    },
  }

  constructor(props) {
    super(props)
  }

  render() {
    return (
      <Help
        steps={PlayerHelp.steps}
        active={this.props.active}
        onStateChanged={this.props.onStateChanged}
        onActiveChanged={this.props.onActiveChanged}
      ></Help>
    )
  }
}
