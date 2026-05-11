import React from 'react'
import Progress from './Progress.jsx'
import { colors } from 'fomoplayer_shared/theme'

export default class Status extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div>
        <h2>Processing</h2>
        {this.props.message}
        <Progress
          percent={this.props.progress}
          barColor={colors.brandPrimary}
          bgColor="#222"
          style={{ margin: '0.5rem 0' }}
        />
      </div>
    )
  }
}
