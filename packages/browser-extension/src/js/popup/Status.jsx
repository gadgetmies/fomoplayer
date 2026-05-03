import React from 'react'
import Progress from './Progress.jsx'

export default class Status extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <p>
        <h2>Processing</h2>
        {this.props.message}
        <br />
        <Progress percent={this.props.progress} barColor="#b40089" bgColor="#222" style={{ margin: '0.5rem 0' }} />
      </p>
    )
  }
}
