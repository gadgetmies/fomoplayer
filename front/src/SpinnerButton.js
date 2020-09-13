import React, { Component } from 'react'
import './SpinnerButton.css'

class SpinnerButton extends Component {
  static defaultProps = {
    size: 'small'
  }

  render() {
    return <button
      type='submit'
      disabled={this.props.loading}
      className={`button button-push_button-${this.props.size} button-push_button-primary ${
        this.props.className}`}
      style={this.props.style}
      onClick={this.props.onClick}>
      {
        this.props.loading ?
          <>
            {this.props.loadingLabel}
            <div className={`loading-indicator loading-indicator__${this.props.size}`}><div></div><div></div><div></div><div></div></div>
          </> :
          this.props.label
      }
    </button>
  }
}

export default SpinnerButton
