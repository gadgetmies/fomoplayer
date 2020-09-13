import React, { Component } from 'react'
import { requestJSONwithCredentials } from './request-json-with-credentials.js'
import SpinnerButton from './SpinnerButton.js'

class RefreshButton extends Component {
    constructor(props) {
        super(props)

        this.state = {
            refreshing: false,
            refreshError: false,
            refreshDone: false,
            updatingTracks: false,
            uuid: undefined
        }

        this.refresh = this.refresh.bind(this)
        this.updateRefreshStatus = this.updateRefreshStatus.bind(this)
        this.updateTracks = this.updateTracks.bind(this)
    }

    static get defaultProps() {
        return {
            size: 'large'
        }
    }

    async refresh() {
        this.setState({ refreshing: true, refreshError: false, refreshDone: false })

        try {
            const { uuid } = await requestJSONwithCredentials({
                path: `/stores/${this.props.store}/refresh`,
                method: 'POST'
            })

            this.setState({ uuid })
            return this.updateRefreshStatus()
        } catch (e) {
            console.error('Failed to start refresh', e)
            this.setState({ refreshing: false, refreshError: true })
        }
    }

    async updateRefreshStatus() {
        try {
            const { finished } = await requestJSONwithCredentials({
                path: `/stores/${this.props.store}/refresh/${this.state.uuid}`,
                method: 'GET'
            })
            return finished ?
                this.setState({ refreshing: false, uuid: undefined, refreshDone: true }) :
                setTimeout(() => this.updateRefreshStatus(this.state.uuid), 1000)
        } catch (e) {
            console.error('Refresh update failed', e)
            this.setState({ refreshing: false, uuid: undefined, refreshError: true })
        }
    }

    async updateTracks() {
        this.setState({ updatingTracks: true, updateError: false })
        try {
            this.props.onUpdateTracks()
            this.setState({ updatingTracks: false, refreshDone: false })
        } catch (e) {
            console.error('Updating tracks failed', e)
            this.setState({ updatingTracks: false, updateError: true })
        }
    }

    render() {
        return this.state.refreshDone ?
            <>
                <SpinnerButton
                    loading={this.state.updatingTracks}
                    onClick={this.updateTracks}
                    loadingLabel='Updating'
                    label='Update tracks'
                    className={`login-button ${this.props.className}`}
                    size={this.props.size}
                />
                {this.state.updateError ? 'Failed to update tracks from server' : ''}
            </> :
            <>
                <SpinnerButton
                    loading={this.state.refreshing}
                    onClick={this.refresh}
                    loadingLabel='Refreshing'
                    label='Refresh'
                    className={`login-button ${this.props.className}`}
                    size={this.props.size}
                />
                {this.state.refreshError ? 'Failed to fetch status from server' : ''}
            </>
    }
}

export default RefreshButton
