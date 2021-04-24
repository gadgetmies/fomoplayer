import React, { Component } from 'react'
import './SpinnerButton.css'

class Spinner extends Component {
  static defaultProps = {
    size: 'small'
  }

  render() {
    return <div className={`loading-indicator loading-indicator__${this.props.size}`}>
      <div/>
      <div/>
      <div/>
      <div/>
    </div>
  }
}
export default Spinner
