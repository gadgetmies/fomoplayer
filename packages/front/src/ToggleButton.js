import React, { Component } from 'react'
import './ToggleButton.css'

// A switch. By default `checked` only sets the starting position; with `controlled` the switch always shows `checked`
// and the parent changes it in `onChange`.
class ToggleButton extends Component {
  render() {
    const checkedProps = this.props.controlled
      ? { checked: Boolean(this.props.checked) }
      : { defaultChecked: this.props.checked }
    return (
      <label className="toggle-button" title={this.props.title}>
        <input
          type="checkbox"
          id={this.props.id}
          disabled={this.props.disabled}
          aria-label={this.props.ariaLabel}
          data-testid={this.props.testId}
          {...checkedProps}
          onChange={(e) => this.props.onChange(e.target.checked)}
        />
        <span className="toggle-button_slider" />
      </label>
    )
  }
}

export default ToggleButton
