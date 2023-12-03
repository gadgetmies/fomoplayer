import React, { Component } from 'react'
import Spinner from './Spinner'

class SpinnerButton extends Component {
  static defaultProps = {
    size: 'small'
  }

  render() {
    const { className, label, loading, loadingLabel, disabled, children, size, style, onClick, ...rest } = this.props

    return (
      <button
        type="submit"
        disabled={disabled || loading}
        className={`button button-push_button-${size} button-push_button-primary ${className || ''}`}
        style={style}
        onClick={onClick}
        {...rest}
      >
        {children !== undefined ? (
          <>
            {children} {loading ? <Spinner size={size} /> : null}
          </>
        ) : loading ? (
          <>
            {loadingLabel}
            <Spinner />
          </>
        ) : (
          label
        )}
      </button>
    )
  }
}

export default SpinnerButton
