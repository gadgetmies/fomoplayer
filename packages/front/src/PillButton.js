import React, { Component } from 'react'

class PillButton extends Component {
  onClick() {}
  render() {
    return (
      <button
        className={`${this.props.className || ''} button pill pill-button`}
        onClick={e => this.props.onClick(e)}
        disabled={this.props.disabled}
        style={this.props.style}
      >
        <span className="pill-button-contents">{this.props.children}</span>
      </button>
    )
  }
}

export default PillButton
