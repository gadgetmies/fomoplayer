import React, {Component} from 'react'
import requestJSONwithCredentials from './request-json-with-credentials.js'
import FontAwesome from 'react-fontawesome'
import PillButton from './PillButton.js'

export default class CookieLogin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false,
      copied: false
    }
  }

  static get defaultProps() {
    return {
      size: 'large'
    }
  }

  submitLogin() {
    this.setState({loggingIn: true})
    return requestJSONwithCredentials({
      path: this.props.loginPath,
      method: 'POST',
      body: {cookie: this.state.cookie}
    }).then(results => {
      this.setState({loggingIn: false})
      if (!results.ok) {
        this.setState({loginError: true})
      }
    })
  }

  render() {
    return <form
      className={this.props.className}
      style={{ height: '100%', overflow: 'hidden' }}
      onSubmit={e => {
        e.preventDefault();
        this.submitLogin()
          .then(() => this.props.onLoginDone())
      }
      }>

      <div>
        <label className="login-label">
        <span className={`login-label-text login-label-text-${this.props.size}`}>
            Cookie
            <PillButton style={{float: 'right'}}
                onClick={(e) => {
                    const el = document.createElement('textarea');
                    el.value = 'copy(document.cookie)'
                    document.body.appendChild(el)
                    el.select()
                    document.execCommand('copy')
                    document.body.removeChild(el)
                    e.preventDefault()
                    this.setState({copied: true})
                    const that = this
                    setTimeout(() => that.setState({copied: false}), 1000)
                }}>{!this.state.copied ? <>Copy script <FontAwesome name='copy'/></> : 'Copied!'}
                </PillButton>
        </span>
        <input type="text" name="cookie"
                disabled={this.state.loggingIn}
                onInput={e => this.setState({cookie: e.target.value})}
                className={`text-input login-input text-input-${this.props.size}`}
        />
        </label>
        <button
          className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
          disabled={this.state.loggingIn}
        >Login
        </button>
        {
          this.state.loginError ? <span>Login failed.</span> : null
        }
      </div>
    </form>
  }
}
