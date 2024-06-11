import React, { Component } from 'react'
import './ToggleButton.css'

class ToggleButton extends Component {
  render() {
    return (
      <label className="toggle-button">
        <input
          type="checkbox"
          id={this.props.id}
          disabled={this.props.disabled}
          defaultChecked={this.props.checked}
          onChange={(e) => this.props.onChange(e.target.checked)}
        />
        <span className="toggle-button_slider" />
      </label>
    )
  }
}

export default ToggleButton
