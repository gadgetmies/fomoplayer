const express = require('express')
const logger = require('fomoplayer_shared').logger(__filename)
const storage = require('./shared/minio')

// The redirect is cached briefly so a browser asks again well before the signed URL expires.
const REDIRECT_MAX_AGE_SECONDS = 5 * 60

// Objects are private (Railway buckets cannot be public). Instead of streaming them through the service,
// answer with a redirect to a short-lived presigned URL, so the browser downloads straight from the bucket.
const createStorageRouter = ({
  getClient = storage.getMinioClient,
  getBucketName = storage.getBucketName,
  presign = storage.presignedObjectUrl,
} = {}) => {
  const router = express.Router()

  router.get('/*key', async (req, res) => {
    const segments = req.params.key
    if (!segments.length || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      return res.status(404).end()
    }

    const client = getClient()
    const bucket = getBucketName()
    if (!client || !bucket) {
      return res.status(503).send({ error: 'File storage not configured' })
    }

    try {
      const url = await presign(client, bucket, segments.join('/'))
      res.set('Cache-Control', `private, max-age=${REDIRECT_MAX_AGE_SECONDS}`)
      res.redirect(302, url)
    } catch (error) {
      logger.error('Error presigning storage object URL', { error: error.message, code: error.code })
      res.status(500).end()
    }
  })

  return router
}

module.exports = { createStorageRouter, REDIRECT_MAX_AGE_SECONDS }
