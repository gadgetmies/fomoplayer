import React, { Component } from 'react'
import './SpinnerButton.css'

class Spinner extends Component {
  static defaultProps = {
    size: 'small',
    color: '#fff',
  }

  render() {
    const style = { borderColor: `${this.props.color} transparent transparent transparent` }
    return (
      <div className={`loading-indicator loading-indicator__${this.props.size}`}>
        <div style={style} />
        <div style={style} />
        <div style={style} />
        <div style={style} />
      </div>
    )
  }
}
export default Spinner
