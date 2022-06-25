import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'

class CopyToClipboardButton extends Component {
  constructor(props) {
    super(props)

    this.state = {
      copied: false
    }
  }

  render() {
    return (
      <button
        type="submit"
        onClick={async e => {
          e.stopPropagation()
          await navigator.clipboard.writeText(this.props.content)
          this.setState({ copied: true })
          await new Promise(resolve => setTimeout(resolve, 5000))
          this.setState({ copied: false })
        }}
        title={this.props.title}
        style={this.props.style}
      >
        <FontAwesomeIcon icon={this.state.copied ? 'clipboard-check' : 'clipboard'} /> {this.props.label}
      </button>
    )
  }
}

export default CopyToClipboardButton
