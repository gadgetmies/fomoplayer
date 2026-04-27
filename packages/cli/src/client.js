'use strict'

// Node 18+ ships a global fetch; no external dependency needed.
// If running on an older Node, an error will surface at runtime.

class FomoPlayerClient {
  constructor({ apiUrl, apiKey }) {
    this.apiUrl = apiUrl
    this.apiKey = apiKey
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
}

module.exports = { FomoPlayerClient }
