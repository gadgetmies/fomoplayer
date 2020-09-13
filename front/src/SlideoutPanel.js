import * as Slideout from 'slideout'
import React, { Component } from 'react'

class SlideoutPanel extends Component {
  constructor () {
    super()
    this.state = {
      slideout: undefined
    }
  }

  componentDidMount() {
    const slideout = new Slideout({
      'panel': document.getElementById('panel'),
      'menu': document.getElementById('menu'),
      'padding': 256,
      'tolerance': 70
    })

    slideout.on('open', this.props.onOpen)

    this.setState({
      slideout
    })
  }

  toggle() {
    this.state.slideout.toggle()
  }

  render() {
    return <div id="panel" style={{ height: "100%", overflow: "hidden" }}>
      {this.props.children}
    </div>
  }
}

export default SlideoutPanel
