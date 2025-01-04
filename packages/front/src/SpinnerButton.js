import React, { Component } from 'react'
import Spinner from './Spinner'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './buttons.css'

class SpinnerButton extends Component {
  static defaultProps = {
    size: 'small',
  }

  render() {
    const { className, label, loading, loadingLabel, disabled, icon, children, size, style, onClick, ...rest } =
      this.props

    return (
      <button
        type="submit"
        disabled={disabled || loading}
        className={`button button-push_button button-push_button-${size} button-push_button-primary ${className || ''}`}
        style={style}
        onClick={onClick}
        {...rest}
      >
        {loading ? <Spinner size={size} /> : icon && <FontAwesomeIcon icon={icon} />}
        {loading || icon ? ' ' : null}
        {children !== undefined ? children : loading ? loadingLabel : label}
      </button>
    )
  }
}

export default SpinnerButton
