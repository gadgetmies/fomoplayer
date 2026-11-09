'use strict'

// A Fomo Player cart with every one of its tracks, as `{ ...cart, tracks }`. `GET /api/me/carts/<id>` returns the cart
// and one page of its tracks (`{ cart, tracks, page }`), so this follows the pages until the whole cart has been read.

const CART_PAGE_SIZE = 500

const fetchCartWithAllTracks = async (apiFetch, cartId) => {
  let cart = null
  const tracks = []
  for (;;) {
    const response = await apiFetch(`/api/me/carts/${cartId}?offset=${tracks.length}&limit=${CART_PAGE_SIZE}`)
    if (!response) return cart
    cart = response.cart
    tracks.push(...response.tracks)
    if (response.tracks.length < CART_PAGE_SIZE || tracks.length >= response.page.total) break
  }
  return { ...cart, tracks }
}

module.exports = { fetchCartWithAllTracks, CART_PAGE_SIZE }
