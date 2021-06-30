import React, { Component } from 'react'
import Spinner from './Spinner'

class SpinnerButton extends Component {
  static defaultProps = {
    size: 'small'
  }

  render() {
    return (
      <button
        type="submit"
        disabled={this.props.disabled || this.props.loading}
        className={`button button-push_button-${this.props.size} button-push_button-primary ${this.props.className || ''}`}
        style={this.props.style}
        onClick={this.props.onClick}
      >
        {this.props.children !== undefined ? (
          <>
            {this.props.children} {this.props.loading ? <Spinner size={this.props.size} /> : null}
          </>
        ) : this.props.loading ? (
          <>
            {this.props.loadingLabel}
            <Spinner />
          </>
        ) : (
          this.props.label
        )}
      </button>
    )
  }
}

export default SpinnerButton
