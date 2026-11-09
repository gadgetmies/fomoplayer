'use strict'

// Node 18+ ships a global fetch; no external dependency needed.
// If running on an older Node, an error will surface at runtime.

const { getApiKey, getApiUrl } = require('./config')

// Cart tracks are read this many at a time (the API's maximum page).
const CART_PAGE_SIZE = 500

const definedParams = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))

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
    return (await this.get(`/me/tracks?${new URLSearchParams(definedParams(params))}`)).json()
  }

  async markTrackHeard(id, heard = true) {
    return (await this.post(`/me/tracks/${id}`, { heard })).json()
  }

  async markAllHeard(heard = true, interval) {
    return (await this.request('PATCH', '/me/tracks', { heard, interval })).json()
  }

  async undoHeard(since) {
    return this.request('DELETE', `/me/tracks/heard?since=${encodeURIComponent(since)}`)
  }

  async getArtistFollows(params = {}) {
    return (await this.get(`/me/follows/artists?${new URLSearchParams(params)}`)).json()
  }

  async getLabelFollows(params = {}) {
    return (await this.get(`/me/follows/labels?${new URLSearchParams(params)}`)).json()
  }

  async getPlaylistFollows(params = {}) {
    return (await this.get(`/me/follows/playlists?${new URLSearchParams(params)}`)).json()
  }

  async addArtistFollows(follows) {
    return this.post('/me/follows/artists', follows)
  }

  async addLabelFollows(follows) {
    return this.post('/me/follows/labels', follows)
  }

  async addPlaylistFollows(follows) {
    return this.post('/me/follows/playlists', follows)
  }

  async setFollowStarred(type, id, starred) {
    return this.request('PUT', `/me/follows/${type}/${id}`, { starred })
  }

  async getCarts() {
    return (await this.get('/me/carts')).json()
  }

  // One page of a cart's tracks when a limit is given, otherwise every track (the API returns at most a page at a time).
  async getCartTracks(cartId, { offset, limit, store } = {}) {
    const cartPath = (o, l) =>
      `/me/carts/${cartId}?${new URLSearchParams(definedParams({ offset: o, limit: l, store }))}`
    if (limit !== undefined) return (await (await this.get(cartPath(offset, limit))).json()).tracks
    const tracks = []
    for (;;) {
      const { tracks: pageTracks, page } = await (
        await this.get(cartPath((offset ?? 0) + tracks.length, CART_PAGE_SIZE))
      ).json()
      tracks.push(...pageTracks)
      if (pageTracks.length < CART_PAGE_SIZE || (offset ?? 0) + tracks.length >= page.total) return tracks
    }
  }

  async createCart(name) {
    return (await this.post('/me/carts', { name })).json()
  }

  async deleteCart(id) {
    return this.request('DELETE', `/me/carts/${id}`)
  }

  async getArtistIgnores() {
    return (await this.get('/me/ignores/artists')).json()
  }

  async getLabelIgnores() {
    return (await this.get('/me/ignores/labels')).json()
  }

  async addArtistIgnore(id) {
    return this.post('/me/ignores/artists', [id])
  }

  async addLabelIgnore(id) {
    return this.post('/me/ignores/labels', [id])
  }

  async addReleaseIgnore(id) {
    return this.post('/me/ignores/releases', [id])
  }

  async removeArtistIgnore(id) {
    return this.request('DELETE', `/me/ignores/artists/${id}`)
  }

  async removeLabelIgnore(id) {
    return this.request('DELETE', `/me/ignores/labels/${id}`)
  }

  async getNotifications() {
    return (await this.get('/me/notifications')).json()
  }

  async getSearchNotifications() {
    return (await this.get('/me/notifications/search')).json()
  }

  async addSearchNotification(string, store) {
    return this.post('/me/notifications/search', { string, store })
  }

  async removeSearchNotification(id) {
    return this.request('DELETE', `/me/notifications/search/${id}`)
  }

  async getScoreWeights() {
    return (await this.get('/me/score-weights')).json()
  }

  async setScoreWeights(weights) {
    return this.request('PATCH', '/me/score-weights', weights)
  }

  async getSettings() {
    return (await this.get('/me/settings')).json()
  }

  async setEmail(email) {
    return this.request('PATCH', '/me/settings', { email })
  }

  async listApiKeys() {
    return (await this.get('/me/api-keys')).json()
  }

  async revokeApiKey(id) {
    return this.request('DELETE', `/me/api-keys/${id}`)
  }

  async getSchema() {
    return (await this.get('/me/query/schema')).json()
  }

  async executeQuery(sql) {
    return (await this.post('/me/query', { sql })).json()
  }

  async search(type, query) {
    if (type === 'tracks') {
      return (await (await this.get(`/tracks?${new URLSearchParams({ q: query })}`)).json()).tracks
    }
    const all = type === 'artists' ? await this.getArtistFollows() : await this.getLabelFollows()
    const q = query.toLowerCase()
    return all.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
  }
}

module.exports = { FomoPlayerClient }
