import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'

class FullScreenPopup extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div
        className="full-screen-popup-container align-center-container scroll-container"
        onClick={e => {
          if (e.target === e.currentTarget) {
            this.props.onCloseClicked()
          }
        }}
        style={{ display: this.props.open ? 'flex' : 'none' }}
      >
        <div className={`full-screen-popup align-center-item ${this.props.className}`}>
          <h1 className="full-screen-popup-title">{this.props.title}</h1>
          <div className="full-screen-popup-close">
            <button onClick={this.props.onCloseClicked}>
              <FontAwesome name="times-circle" />
            </button>
          </div>
          {this.props.children}
        </div>
      </div>
    )
  }
}

export default FullScreenPopup
