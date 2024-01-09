import "./PillButton.css"
import React, { Component } from 'react'

class PillButton extends Component {
  onClick() {}
  render() {
    return (
      <button
        className={`button pill pill-button ${this.props.className || ''}`}
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
