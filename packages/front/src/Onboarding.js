import Joyride, { ACTIONS } from 'react-joyride'
import React, { Component } from 'react'

class Onboarding extends Component {
  constructor(props) {
    super(props)
    this.state = {
      run: props.active,
      onboardingIndex: 0,
      onboardingHelpers: null
    }
  }

  static steps = {
    Intro: {
      content: (
        <>
          <h2>Hi there! Welcome to the Fomo Player!</h2>
          <p>
            Seems like you are new here as there are no tracks in your collection. Follow this guide to go through the
            main features to get started!
          </p>
        </>
      ),
      locale: {
        skip: <strong aria-label="skip">Thanks, but I'll find my own way around</strong>
      },
      placement: 'center',
      target: 'body',
      disableCloseOnEsc: false,
      showSkipButton: true
    },
    Menu: {
      target: '[data-onboarding-id=slideout-button]',
      placement: 'right',
      content: (
        <p>
          As you just logged in, there are no tracks in your collection yet. To fix this, let's head to the setting by
          first opening the menu.
        </p>
      ),
      disableNext: true,
      locale: { next: 'Step' }
    },
    Settings: {
      target: '[data-onboarding-id=settings-button]',
      placement: 'right',
      content: <p>... and then clicking the Settings button</p>,
      disableNext: true,
      locale: { next: 'Step' }
    },
    Search: {
      target: '[data-onboarding-id=follow-search]',
      placement: 'right',
      content: (
        <p>
          Input the name of an artist of a label you'd like to follow. All the new tracks that are released by the
          followed artists or labels will be automatically added to your collection and will be visible in the Tracks
          view.
        </p>
      ),
      disableNext: true,
      locale: { next: 'Step' }
    },
    FollowItem: {
      target: '[data-onboarding-id=follow-item]',
      placement: 'right',
      content: (
        <>
          <p>Here are the artists and labels found from the supported stores for the term you entered.</p>
          <p>
            In case there are multiple results with the same name, you can click on the image to open the artist or
            label page on the services to confirm you are choosing the correct one.
          </p>
        </>
      )
    },
    FollowButton: {
      target: '[data-onboarding-id=follow-button]:not([disabled])',
      placement: 'right-end',
      content: (
        <p>
          Click on the follow button to follow this artist. (Don't worry, you can remove the artist from the followed
          artists in later steps.)
        </p>
      ),
      disableNext: true,
      locale: { next: 'Step' }
    },
    FollowedItem: {
      target: '[data-onboarding-id=followed-items]',
      placement: 'right-end',
      content: <p>The followed artists are shown here (and the labels below).</p>,
      disableNext: true,
      locale: { next: 'Step' }
    },
    Star: {
      target: '[data-onboarding-id=star-button]',
      placement: 'right-end',
      content: (
        <p>
          To raise the new releases from the artist to the top of the list, you can add them as favorites by pressing
          the star button.
        </p>
      ),
      disableNext: true,
      locale: { next: 'Step' }
    },
    Unfollow: {
      target: '[data-onboarding-id=unfollow-button]',
      placement: 'right-end',
      content: <p>To remove a follow, click the X.</p>,
      disableNext: true,
      locale: { next: 'Step' }
    },
    ReopenMenu: {
      target: '[data-onboarding-id=slideout-button]',
      placement: 'top',
      content: <p>Let's head back to the menu for a few important things</p>,
      disableNext: true,
      locale: { next: 'Step' }
    },
    Instructions: {
      target: '[data-onboarding-id=instructions-button]',
      placement: 'top',
      content: (
        <p>
          There's a more detailed instructions page on Github that lists many more features, how they work (and in some
          cases also why they work the way they do).
        </p>
      )
    },
    Issues: {
      target: '[data-onboarding-id=issues-button]',
      placement: 'top',
      content: (
        <p>
          The site is very much a work in progress, so it is probably not unusual to bump into issue. You can help make
          the site better by reporting an issue using the Report issue button in the menu (requires a GitHub account.).
        </p>
      )
    },
    Improvements: {
      target: '[data-onboarding-id=improvements-button]',
      placement: 'top',
      content: (
        <p>
          You can also share your ideas on how to improve the service by clicking the Share improvement ideas button
          (also requires a GitHub account.).
        </p>
      ),
      disableCloseOnEsc: false
    },
    Help: {
      target: '[data-onboarding-id=help-button]',
      placement: 'top',
      content: (
        <>
          <p>
            In case you get stuck or baffled, there are help buttons in some views to assist you in using this site.
          </p>
          <p>Otherwise, that's all for now. Hope you enjoy using the service and find interesting releases!</p>
        </>
      ),
      locale: {
        last: <strong aria-label="skip">Done</strong>
      }
    }
  }

  static isCurrentStep(step) {
    return Onboarding.state.step.target === step.target
  }

  static moveToNextWhenItemVisible(itemSelector) {
    const item = document.querySelector(itemSelector)
    if (item) {
      Onboarding.helpers.next()
    } else {
      setTimeout(() => Onboarding.moveToNextWhenItemVisible(itemSelector), 100)
    }
  }

  static helpers = null
  static state = null
  static onboarding = false

  render() {
    return (
      <Joyride
        steps={Object.values(Onboarding.steps)}
        run={this.state.run}
        continuous
        scrollToFirstStep
        spotlightClicks={true}
        styles={{
          options: {
            zIndex: 10000
          }
        }}
        disableOverlayClose
        showProgress
        showSkipButton={false}
        disableCloseOnEsc={true}
        hideBackButton={true}
        getHelpers={helpers => {
          Onboarding.helpers = helpers
        }}
        callback={state => {
          Onboarding.state = state
          Onboarding.active = state.status === 'running'
          const nextButton = document.querySelector('.react-joyride__tooltip button')
          if (state.step.disableNext === true) {
            nextButton?.setAttribute('disabled', '')
          } else {
            nextButton?.removeAttribute('disabled')
          }

          if (state.action === ACTIONS.CLOSE) {
            this.setState({ run: false })
            this.props.onOnboardingEnd()
          }
        }}
      />
    )
  }
}

export default Onboarding
