'use strict'

// Node 18+ ships a global fetch; no external dependency needed.
// If running on an older Node, an error will surface at runtime.

const { getApiKey, getApiUrl } = require('./config')

class FomoPlayerClient {
  constructor({ apiUrl, apiKey } = {}) {
    this.apiUrl = apiUrl ?? getApiUrl()
    this.apiKey = apiKey ?? getApiKey()
  }

  async request(method, path, body) {
    const url = `${this.apiUrl}${path}`
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    const options = { method, headers }
    if (body !== undefined) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      let responseBody
      try {
        responseBody = await response.text()
      } catch {
        responseBody = ''
      }
      throw new Error(
        `Request failed with status ${response.status}: ${responseBody}`,
      )
    }

    return response
  }

  get(path) {
    return this.request('GET', path)
  }

  post(path, body) {
    return this.request('POST', path, body)
  }

  async getTracks(params = {}) {
    return (await this.get(`/api/me/tracks?${new URLSearchParams(params)}`)).json()
  }

  async markTrackHeard(id, heard = true) {
    return (await this.post(`/api/me/tracks/${id}`, { heard })).json()
  }

  async markAllHeard(heard = true, interval) {
    return (await this.request('PATCH', '/api/me/tracks', { heard, interval })).json()
  }

  async undoHeard(since) {
    return this.request('DELETE', `/api/me/tracks/heard?since=${encodeURIComponent(since)}`)
  }

  async getArtistFollows(params = {}) {
    return (await this.get(`/api/me/follows/artists?${new URLSearchParams(params)}`)).json()
  }

  async getLabelFollows(params = {}) {
    return (await this.get(`/api/me/follows/labels?${new URLSearchParams(params)}`)).json()
  }

  async getPlaylistFollows(params = {}) {
    return (await this.get(`/api/me/follows/playlists?${new URLSearchParams(params)}`)).json()
  }

  async addArtistFollows(follows) {
    return this.post('/api/me/follows/artists', follows)
  }

  async addLabelFollows(follows) {
    return this.post('/api/me/follows/labels', follows)
  }

  async addPlaylistFollows(follows) {
    return this.post('/api/me/follows/playlists', follows)
  }

  async setFollowStarred(type, id, starred) {
    return this.request('PUT', `/api/me/follows/${type}/${id}`, { starred })
  }

  async getCarts() {
    return (await this.get('/api/me/carts')).json()
  }

  async getCartTracks(cartId, params = {}) {
    const r = await (await this.get(`/api/me/carts/${cartId}?${new URLSearchParams(params)}`)).json()
    return r.tracks ?? r
  }

  async createCart(name) {
    return (await this.post('/api/me/carts', { name })).json()
  }

  async deleteCart(id) {
    return this.request('DELETE', `/api/me/carts/${id}`)
  }

  async getArtistIgnores() {
    return (await this.get('/api/me/ignores/artists')).json()
  }

  async getLabelIgnores() {
    return (await this.get('/api/me/ignores/labels')).json()
  }

  async addArtistIgnore(id) {
    return this.post('/api/me/ignores/artists', { id })
  }

  async addLabelIgnore(id) {
    return this.post('/api/me/ignores/labels', { id })
  }

  async addReleaseIgnore(id) {
    return this.post('/api/me/ignores/releases', { id })
  }

  async removeArtistIgnore(id) {
    return this.request('DELETE', `/api/me/ignores/artists/${id}`)
  }

  async removeLabelIgnore(id) {
    return this.request('DELETE', `/api/me/ignores/labels/${id}`)
  }

  async getNotifications() {
    return (await this.get('/api/me/notifications')).json()
  }

  async getSearchNotifications() {
    return (await this.get('/api/me/notifications/search')).json()
  }

  async addSearchNotification(string, store) {
    return this.post('/api/me/notifications/search', { string, store })
  }

  async removeSearchNotification(id) {
    return this.request('DELETE', `/api/me/notifications/search/${id}`)
  }

  async getScoreWeights() {
    return (await this.get('/api/me/score-weights')).json()
  }

  async setScoreWeights(weights) {
    return this.request('PATCH', '/api/me/score-weights', weights)
  }

  async getSettings() {
    return (await this.get('/api/me/settings')).json()
  }

  async setEmail(email) {
    return this.request('PATCH', '/api/me/settings', { email })
  }

  async listApiKeys() {
    return (await this.get('/api/me/api-keys')).json()
  }

  async revokeApiKey(id) {
    return this.request('DELETE', `/api/me/api-keys/${id}`)
  }

  async getSchema() {
    return (await this.get('/api/me/query/schema')).json()
  }

  async executeQuery(sql) {
    return (await this.post('/api/me/query', { sql })).json()
  }

  async search(type, query) {
    if (type === 'tracks') {
      const d = await this.getTracks({ q: query })
      return [...(d.tracks?.new ?? []), ...(d.tracks?.recent ?? []), ...(d.tracks?.heard ?? [])]
    }
    const all = type === 'artists' ? await this.getArtistFollows() : await this.getLabelFollows()
    const q = query.toLowerCase()
    return all.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
  }
}

module.exports = { FomoPlayerClient }
