import React, {Component} from 'react'
import requestJSONwithCredentials from './request-json-with-credentials.js'

export default class Login extends Component {
  constructor(props) {
    super(props)
    this.state = {
      username: '',
      password: '',
      loggingIn: false,
      loggingOut: false,
      loginError: false
    }
  }

  static get defaultProps() {
    return {
      usernameField: 'username',
      passwordField: 'password',
      size: 'large'
    }
  }

  submitLogin() {
    this.setState({loggingIn: true})
    return requestJSONwithCredentials({
      path: this.props.loginPath,
      method: 'POST',
      body: {
        [this.props.usernameField]: this.state.username,
        [this.props.passwordField]: this.state.password
      }
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
          <span className={`login-label-text login-label-text-${this.props.size}`}>Username</span>
          <input type="text" name={`username-${this.props.loginName}`}
                 autoComplete={`username-${this.props.loginName}`}
                 disabled={this.state.loggingIn}
                 onInput={e => this.setState({ username: e.target.value })}
                 className={`text-input login-input text-input-${this.props.size}`}
          />
        </label>

        <label className="login-label">
          <span className={`login-label-text login-label-text-${this.props.size}`}>Password</span>
          <input type="password" name={`password-${this.props.loginName}`}
                 autoComplete={`password-${this.props.loginName}`}
                 disabled={this.state.loggingIn}
                 onInput={e => this.setState({ password: e.target.value })}
                 className={`text-input login-input text-input-${this.props.size}`}
          />
        </label>
        <br/>
        <button
          className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
          disabled={this.state.loggingIn}
        >Login</button>
        {
          this.state.loginError ? <span>Login failed.</span> : null
        }
      </div>
    </form>
  }
}
