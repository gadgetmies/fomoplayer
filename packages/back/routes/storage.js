const express = require('express')
const logger = require('fomoplayer_shared').logger(__filename)
const storage = require('./shared/minio')

// The redirect is cached briefly so a browser asks again well before the signed URL expires.
const REDIRECT_MAX_AGE_SECONDS = 5 * 60
// Waveform images are written once under a unique key, so the browser may keep them.
const IMAGE_MAX_AGE_SECONDS = 24 * 60 * 60

// Waveform images are served through the service instead. The player draws the played part of a waveform with the
// image as a CSS mask, and a browser loads mask images in CORS mode: from the bucket's origin, which sends no CORS
// headers, the mask fails and the played part is never shown. Served from the page's own origin it works. The images
// are a few kilobytes; audio, which can be megabytes, keeps the redirect.
const isServedThroughService = (key) => /\.png$/i.test(key)

const readObject = async (client, bucket, key) => client.getObject(bucket, key)
const isMissingObject = (error) => ['NoSuchKey', 'NotFound'].includes(error.code)

// Objects are private (Railway buckets cannot be public). Instead of streaming them through the service,
// answer with a redirect to a short-lived presigned URL, so the browser downloads straight from the bucket
// (except waveform images, see isServedThroughService).
const createStorageRouter = ({
  getClient = storage.getMinioClient,
  getBucketName = storage.getBucketName,
  presign = storage.presignedObjectUrl,
  read = readObject,
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

    const key = segments.join('/')
    if (isServedThroughService(key)) {
      try {
        const object = await read(client, bucket, key)
        res.set('Content-Type', 'image/png')
        res.set('Cache-Control', `private, max-age=${IMAGE_MAX_AGE_SECONDS}, immutable`)
        object.on('error', (error) => {
          logger.error('Error streaming storage object', { error: error.message, code: error.code })
          res.destroy(error)
        })
        object.pipe(res)
      } catch (error) {
        if (isMissingObject(error)) return res.status(404).end()
        logger.error('Error reading storage object', { error: error.message, code: error.code })
        res.status(500).end()
      }
      return
    }

    try {
      const url = await presign(client, bucket, key)
      res.set('Cache-Control', `private, max-age=${REDIRECT_MAX_AGE_SECONDS}`)
      res.redirect(302, url)
    } catch (error) {
      logger.error('Error presigning storage object URL', { error: error.message, code: error.code })
      res.status(500).end()
    }
  })

  return router
}

module.exports = { createStorageRouter, REDIRECT_MAX_AGE_SECONDS, IMAGE_MAX_AGE_SECONDS }
