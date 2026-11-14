const Minio = require('minio')
const logger = require('fomoplayer_shared').logger(__filename)

// Any S3-compatible object store: a Railway bucket in production, a local MinIO in development.
const storageUrl = process.env.AUDIO_SAMPLE_STORAGE_HOST
const accessKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_ACCESS_KEY
const secretKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_SECRET_KEY
const bucketName = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_NAME
// Railway buckets want region "auto" and virtual-hosted URLs; a MinIO server takes the defaults.
const region = process.env.AUDIO_SAMPLE_STORAGE_REGION || undefined
const urlStyle = process.env.AUDIO_SAMPLE_STORAGE_URL_STYLE || 'path'

// Objects are private: the browser reaches them through the API, which redirects to a presigned URL.
const STORAGE_ROUTE_PREFIX = '/api/storage/'
const PRESIGNED_URL_EXPIRY_SECONDS = 60 * 60

let minioClient = null

const parseClientConfig = (url, { region, urlStyle = 'path' } = {}) => {
  const urlWithoutProtocol = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const useSSL = !url.startsWith('http://')
  const hostPortMatch = urlWithoutProtocol.match(/^([^:/]+)(?::(\d+))?(?:\/.*)?$/)
  const endPoint = hostPortMatch ? hostPortMatch[1] : urlWithoutProtocol.split('/')[0]
  const port = hostPortMatch?.[2] ? parseInt(hostPortMatch[2], 10) : undefined

  return {
    endPoint,
    useSSL,
    ...(port ? { port } : {}),
    ...(region ? { region } : {}),
    pathStyle: urlStyle !== 'virtual',
  }
}

// A fresh environment (a PR preview's own MinIO) starts without the bucket: create it rather than fail every upload.
// Reads go through presigned URLs, so the bucket stays private.
const ensureBucket = async (client, bucket) => {
  if (await client.bucketExists(bucket)) return
  logger.info(`Creating storage bucket ${bucket}`)
  await client.makeBucket(bucket, region)
}

if (storageUrl && accessKey && secretKey) {
  try {
    const clientConfig = parseClientConfig(storageUrl, { region, urlStyle })
    logger.info('Initializing object storage client', {
      endPoint: clientConfig.endPoint,
      port: clientConfig.port,
      useSSL: clientConfig.useSSL,
      pathStyle: clientConfig.pathStyle,
    })
    minioClient = new Minio.Client({ ...clientConfig, accessKey, secretKey })
  } catch (error) {
    logger.error('Error initializing object storage client', error)
    minioClient = null
  }

  if (bucketName && minioClient) {
    ensureBucket(minioClient, bucketName).catch((err) => {
      logger.error('Error ensuring the storage bucket exists', { error: err.message, code: err.code })
    })
  }
} else {
  logger.warn('Object storage configuration missing. Audio sample uploads will not work.')
}

// The URL stored for an object: a path on the API, independent of the storage host and the deployment's domain.
const storageObjectPath = (objectKey) =>
  `${STORAGE_ROUTE_PREFIX}${objectKey.split('/').map(encodeURIComponent).join('/')}`

const presignedObjectUrl = (client, bucket, objectKey) =>
  client.presignedGetObject(bucket, objectKey, PRESIGNED_URL_EXPIRY_SECONDS)

module.exports = {
  getMinioClient: () => minioClient,
  getBucketName: () => bucketName,
  ensureBucket,
  parseClientConfig,
  storageObjectPath,
  presignedObjectUrl,
  PRESIGNED_URL_EXPIRY_SECONDS,
}
