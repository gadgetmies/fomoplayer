'use strict'

// A Fomo Player cart with every one of its tracks. `GET /api/me/carts/<id>` returns one page of tracks at a time, so
// this follows the pages until the whole cart has been read.

const CART_PAGE_SIZE = 500

const fetchCartWithAllTracks = async (apiFetch, cartId) => {
  let cart = null
  const tracks = []
  for (;;) {
    const response = await apiFetch(`/api/me/carts/${cartId}?offset=${tracks.length}&limit=${CART_PAGE_SIZE}`)
    if (!response) return cart
    cart = response
    const pageTracks = response.tracks || []
    tracks.push(...pageTracks)
    if (pageTracks.length < CART_PAGE_SIZE || tracks.length >= (response.track_count ?? 0)) break
  }
  return { ...cart, tracks }
}

module.exports = { fetchCartWithAllTracks, CART_PAGE_SIZE }
