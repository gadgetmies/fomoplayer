import React, {Component} from 'react'
import requestJSONwithCredentials from './request-json-with-credentials.js'
import * as R from 'ramda'

export default class SessionLogin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false
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
      body: R.mapObjIndexed(
        (_, key) => this.state[key],
        this.props.sessionProperties
      )
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
        {
          Object.keys(this.props.sessionProperties)
            .map(key =>
              <label className="login-label" key={key}>
                <span className={`login-label-text login-label-text-${this.props.size}`}>
                  {this.props.sessionProperties[key]}
                </span>
                <input type="text" name={key}
                       disabled={this.state.loggingIn}
                       onInput={e => this.setState({[key]: e.target.value})}
                       className={`text-input login-input text-input-${this.props.size}`}
                />
              </label>)
        }
        <br/>
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
