'use strict'

// A `GET /api/me/carts/<id>` response for a cart given as { ...fields, tracks }: the cart and all its tracks on one page.
const cartResponse = ({ tracks = [], ...cart }) => ({
  cart,
  tracks,
  page: { offset: 0, limit: 500, total: tracks.length },
  meta: {},
})

module.exports = { cartResponse }
