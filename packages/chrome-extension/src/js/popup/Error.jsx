import React from 'react'
import newGithubIssueUrl from 'new-github-issue-url'

export default class Error extends React.Component {
  constructor(props) {
    super(props)

    this.createIssue = this.createIssue.bind(this)
    this.clearError = this.clearError.bind(this)
  }

  createIssue() {
    const issueUrl = newGithubIssueUrl({
      user: 'gadgetmies',
      repo: 'multi_store_player',
      body: `Please tell us, what you were trying to do:

---
Details: ${this.props.error.stack}`
    })

    chrome.tabs.create({ url: issueUrl, active: true })
  }

  clearError() {
    chrome.runtime.sendMessage({ type: 'clearError' })
  }

  render() {
    return (
      <>
        <h1>Error</h1>
        <p>{this.props.error.message}</p>
        <p>
          <button onClick={this.createIssue}>Create an issue on Github</button>
        </p>
        <p>
          <button onClick={this.clearError}>OK</button>
        </p>
      </>
    )
  }
}
