const router = require('express-promise-router')()
const { search } = require('./logic.js')
const { getUserPlaylists, getUserFollowedArtists, followArtists } = require('./logic')
const { getPreviewDetails } = require('../bandcamp/logic')

router.get('/search', ({ query: { q } }, res) => search(q).then((results) => res.send(results)))

router.get('/my-playlists', async ({ user: { id: userId } }, res) => {
  const playlists = await getUserPlaylists(userId)
  res.send(playlists)
})

router.get('/my-followed-artists', async ({ user: { id: userId } }, res) => {
  const followedArtists = await getUserFollowedArtists(userId)
  res.send(followedArtists)
})

router.post('/my-followed-artists', async ({ user: { id: userId }, body: artistUrls }, res) => {
  await followArtists(userId, artistUrls)
  res.status(204).send()
})

router.get('/previews/:previewId', ({ params: { previewId } }, res) => {
  res.status(404).send('Not found')
})

module.exports = router
