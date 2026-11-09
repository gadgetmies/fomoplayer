import { Joyride, STATUS } from 'react-joyride'
import React, { Component } from 'react'
class Help extends Component {
  constructor(props) {
    super(props)
    this.state = {
      active: props.active,
      onboardingIndex: 0,
      onboardingHelpers: null,
    }
  }

  static helpers = null
  static state = null
  static onboarding = false

  componentDidUpdate = ({ active }) => {
    if (active !== this.props.active) {
      this.setState({ active: this.props.active })
    }
  }

  render() {
    return (
      <Joyride
        steps={Object.values(this.props.steps)}
        run={this.state.active}
        continuous
        options={{
          zIndex: 10000,
          // react-joyride 2's default accent; v3 defaults to black.
          primaryColor: '#f04',
          blockTargetInteraction: false,
          showProgress: true,
          // The close button ends the help instead of moving on to the next step.
          closeButtonAction: 'skip',
        }}
        locale={{ nextWithProgress: 'Next (Step {current} of {total})' }}
        onEvent={(state) => {
          const active = state.status === STATUS.RUNNING
          if (this.state.active !== active) {
            this.props.onActiveChanged && this.props.onActiveChanged(active)
          }
          this.setState({ state, active })
          this.props.onStateChanged && this.props.onStateChanged()
        }}
      />
    )
  }
}

export default Help
