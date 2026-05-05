'use strict'

const FEED_SHAPE_MESSAGE =
  'Bandcamp feed endpoint returned an unexpected shape — try re-logging in to bandcamp.com or file a bug.'

class FeedShapeError extends Error {
  constructor(message = FEED_SHAPE_MESSAGE) {
    super(message)
    this.name = 'FeedShapeError'
  }
}

const isJsonContentType = (contentType) =>
  typeof contentType === 'string' && /^application\/json/i.test(contentType.trim())

const assertJsonContentType = (contentType) => {
  if (!isJsonContentType(contentType)) {
    throw new FeedShapeError()
  }
}

const parseFeedPage = (feed) => {
  const entries = feed && feed.stories && feed.stories.entries
  if (!Array.isArray(entries)) {
    throw new FeedShapeError()
  }
  const releases = entries.filter(({ story_type: storyType }) => storyType === 'nr')
  const nextOlderThan = feed.stories.oldest_story_date
  return { releases, nextOlderThan }
}

module.exports = {
  FEED_SHAPE_MESSAGE,
  FeedShapeError,
  isJsonContentType,
  assertJsonContentType,
  parseFeedPage,
}
