'use strict'

const { Parser } = require('node-sql-parser')

const isSelectOnly = (userSql) => {
  try {
    const parser = new Parser()
    const ast = parser.astify(userSql, { database: 'PostgreSQL' })
    const stmts = Array.isArray(ast) ? ast : [ast]
    if (!stmts.every((s) => s.type === 'select')) return false
    // Reject writable CTEs: WITH x AS (INSERT/UPDATE/DELETE ...) SELECT ...
    return stmts.every(
      (s) => !s.with || s.with.every((cte) => cte.stmt?.type === 'select'),
    )
  } catch {
    return false
  }
}

const defineTools = (client) => [
  {
    name: 'get_schema',
    description: 'Get the database schema including table and column definitions',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getSchema(),
  },
  {
    name: 'execute_query',
    description: 'Execute a SELECT-only SQL query against the database',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The SELECT SQL query to execute' },
      },
      required: ['sql'],
    },
    handler: async ({ sql }) => {
      if (!isSelectOnly(sql)) {
        throw new Error('Only SELECT statements are allowed')
      }
      return client.executeQuery(sql)
    },
  },
  {
    name: 'get_tracks',
    description: 'Get tracks from the user library',
    inputSchema: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'Filter by store' },
        limit: { type: 'number', description: 'Maximum number of tracks to return' },
      },
    },
    handler: async ({ store, limit } = {}) => {
      const params = {}
      if (store !== undefined) params.store = store
      if (limit !== undefined) params.limit_new = limit
      return client.getTracks(params)
    },
  },
  {
    name: 'mark_track_heard',
    description: 'Mark a specific track as heard',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Track ID to mark as heard' },
      },
      required: ['id'],
    },
    handler: async ({ id }) => client.markTrackHeard(id),
  },
  {
    name: 'mark_all_heard',
    description: 'Mark all tracks as heard, optionally within a time interval',
    inputSchema: {
      type: 'object',
      properties: {
        interval: { type: 'string', description: 'Time interval (e.g. "1 day")' },
      },
    },
    handler: async ({ interval } = {}) => client.markAllHeard(true, interval),
  },
  {
    name: 'undo_mark_heard',
    description: 'Undo marking tracks as heard since a given timestamp',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO timestamp to undo heard marks since' },
      },
      required: ['since'],
    },
    handler: async ({ since }) => client.undoHeard(since),
  },
  {
    name: 'list_follows',
    description: 'List followed artists, labels, or playlists',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['artists', 'labels', 'playlists'],
          description: 'Type of follows to list',
        },
        store: { type: 'string', description: 'Filter by store' },
      },
      required: ['type'],
    },
    handler: async ({ type, store } = {}) => {
      const params = store ? { store } : {}
      if (type === 'artists') return client.getArtistFollows(params)
      if (type === 'labels') return client.getLabelFollows(params)
      if (type === 'playlists') return client.getPlaylistFollows(params)
      throw new Error(`Unknown follow type: ${type}`)
    },
  },
  {
    name: 'add_follow',
    description: 'Add a follow for an artist, label, or playlist by URL',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['artists', 'labels', 'playlists'],
          description: 'Type of follow to add',
        },
        url: { type: 'string', description: 'URL of the entity to follow' },
      },
      required: ['type', 'url'],
    },
    handler: async ({ type, url }) => {
      if (type === 'artists') return client.addArtistFollows([{ url }])
      if (type === 'labels') return client.addLabelFollows([{ url }])
      if (type === 'playlists') return client.addPlaylistFollows([{ url }])
      throw new Error(`Unknown follow type: ${type}`)
    },
  },
  {
    name: 'list_ignores',
    description: 'List ignored artists or labels',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['artists', 'labels'],
          description: 'Type of ignores to list',
        },
      },
      required: ['type'],
    },
    handler: async ({ type }) => {
      if (type === 'artists') return client.getArtistIgnores()
      if (type === 'labels') return client.getLabelIgnores()
      throw new Error(`Unknown ignore type: ${type}`)
    },
  },
  {
    name: 'add_ignore',
    description: 'Add an ignore for an artist or label by ID',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['artists', 'labels', 'releases'],
          description: 'Type of entity to ignore',
        },
        id: { type: 'number', description: 'ID of the entity to ignore' },
      },
      required: ['type', 'id'],
    },
    handler: async ({ type, id }) => {
      if (type === 'artists') return client.addArtistIgnore(id)
      if (type === 'labels') return client.addLabelIgnore(id)
      if (type === 'releases') return client.addReleaseIgnore(id)
      throw new Error(`Unknown ignore type: ${type}`)
    },
  },
  {
    name: 'remove_ignore',
    description: 'Remove an ignore for an artist or label by ID',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['artists', 'labels'],
          description: 'Type of entity to remove ignore for',
        },
        id: { type: 'number', description: 'ID of the ignore to remove' },
      },
      required: ['type', 'id'],
    },
    handler: async ({ type, id }) => {
      if (type === 'artists') return client.removeArtistIgnore(id)
      if (type === 'labels') return client.removeLabelIgnore(id)
      throw new Error(`Unknown ignore type: ${type}`)
    },
  },
  {
    name: 'list_carts',
    description: 'List all carts',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getCarts(),
  },
  {
    name: 'create_cart',
    description: 'Create a new cart with the given name',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the cart to create' },
      },
      required: ['name'],
    },
    handler: async ({ name }) => client.createCart(name),
  },
  {
    name: 'delete_cart',
    description: 'Delete a cart by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Cart ID to delete' },
      },
      required: ['id'],
    },
    handler: async ({ id }) => client.deleteCart(id),
  },
  {
    name: 'list_cart_tracks',
    description: 'List tracks in a specific cart',
    inputSchema: {
      type: 'object',
      properties: {
        cartId: { type: 'number', description: 'Cart ID to list tracks for' },
      },
      required: ['cartId'],
    },
    handler: async ({ cartId }) => client.getCartTracks(cartId),
  },
  {
    name: 'list_search_notifications',
    description: 'List all search notifications',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getSearchNotifications(),
  },
  {
    name: 'add_search_notification',
    description: 'Add a search notification for a string and optional store',
    inputSchema: {
      type: 'object',
      properties: {
        string: { type: 'string', description: 'Search string to notify on' },
        store: { type: 'string', description: 'Optional store to filter notifications' },
      },
      required: ['string'],
    },
    handler: async ({ string, store }) => client.addSearchNotification(string, store),
  },
  {
    name: 'remove_search_notification',
    description: 'Remove a search notification by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Search notification ID to remove' },
      },
      required: ['id'],
    },
    handler: async ({ id }) => client.removeSearchNotification(id),
  },
  {
    name: 'get_score_weights',
    description: 'Get the current track score weights',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getScoreWeights(),
  },
  {
    name: 'set_score_weights',
    description: 'Set track score weights',
    inputSchema: {
      type: 'object',
      properties: {
        weights: { type: 'object', description: 'Score weights object' },
      },
      required: ['weights'],
    },
    handler: async ({ weights }) => client.setScoreWeights(weights),
  },
  {
    name: 'get_settings',
    description: 'Get user settings',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getSettings(),
  },
  {
    name: 'set_email',
    description: 'Update the user email address',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'New email address' },
      },
      required: ['email'],
    },
    handler: async ({ email }) => client.setEmail(email),
  },
  {
    name: 'search',
    description: 'Search tracks, artists, or labels',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['tracks', 'artists', 'labels'],
          description: 'Type of entity to search',
        },
        query: { type: 'string', description: 'Search query string' },
      },
      required: ['type', 'query'],
    },
    handler: async ({ type, query }) => client.search(type, query),
  },
  {
    name: 'list_api_keys',
    description: 'List all API keys for the current user',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.listApiKeys(),
  },
  {
    name: 'revoke_api_key',
    description: 'Revoke an API key by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'API key ID to revoke' },
      },
      required: ['id'],
    },
    handler: async ({ id }) => client.revokeApiKey(id),
  },
]

module.exports = { defineTools }
