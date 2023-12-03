import Joyride, { ACTIONS, STATUS } from 'react-joyride'
import React, { Component } from 'react'
class Help extends Component {
  constructor(props) {
    super(props)
    this.state = {
      active: props.active,
      onboardingIndex: 0,
      onboardingHelpers: null
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
        spotlightClicks={true}
        styles={{
          options: {
            zIndex: 10000
          }
        }}
        showProgress
        continuous
        getHelpers={helpers => {
          this.setState({ helpers })
        }}
        callback={state => {
          let active = state.status === STATUS.RUNNING
          if (this.state.run !== active) {
            this.props.onActiveChanged && this.props.onActiveChanged(active)
          }
          this.setState({ state, active })
          this.props.onStateChanged && this.props.onStateChanged()

          if ([ACTIONS.CLOSE, ACTIONS.SKIP].includes(state.action)) {
            this.setState({ run: false })
          }
        }}
      />
    )
  }
}

export default Help
