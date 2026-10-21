const Minio = require('minio')
const logger = require('fomoplayer_shared').logger(__filename)

const storageUrl = process.env.AUDIO_SAMPLE_STORAGE_HOST
const accessKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_ACCESS_KEY
const secretKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_SECRET_KEY
const bucketName = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_NAME

let minioClient = null

// Sample URLs are played straight from the bucket, so its objects are public, as in production.
const publicReadPolicy = (bucket) =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] },
    ],
  })

// A fresh environment (a PR preview's own MinIO) starts without the bucket: create it rather than fail every upload.
const ensureBucket = async (client, bucket) => {
  if (await client.bucketExists(bucket)) return
  logger.info(`Creating MinIO bucket ${bucket}`)
  await client.makeBucket(bucket)
  await client.setBucketPolicy(bucket, publicReadPolicy(bucket))
}

if (storageUrl && accessKey && secretKey) {
  try {
    const urlWithoutProtocol = storageUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const useSSL = storageUrl.includes('https://')
    
    let endPoint
    let port
    
    const hostPortMatch = urlWithoutProtocol.match(/^([^:]+)(?::(\d+))?(?:\/.*)?$/)
    if (hostPortMatch) {
      endPoint = hostPortMatch[1]
      port = hostPortMatch[2] ? parseInt(hostPortMatch[2], 10) : (useSSL ? 443 : 80)
    } else {
      const parts = urlWithoutProtocol.split('/')
      endPoint = parts[0]
      port = useSSL ? 443 : 80
    }
    
    const clientConfig = {
      endPoint: endPoint,
      accessKey: accessKey,
      secretKey: secretKey,
      useSSL: useSSL
    }
    
    if (port && !isNaN(port) && port !== (useSSL ? 443 : 80)) {
      clientConfig.port = port
    }
    
    logger.info(`Initializing MinIO client with endpoint: ${endPoint}, port: ${port}, useSSL: ${useSSL}`)
    minioClient = new Minio.Client(clientConfig)
  } catch (error) {
    logger.error('Error initializing MinIO client', error)
    minioClient = null
  }

  if (bucketName && minioClient) {
    ensureBucket(minioClient, bucketName).catch((err) => {
      logger.error('Error ensuring the MinIO bucket exists', { error: err.message, code: err.code })
    })
  }
} else {
  logger.warn('MinIO configuration missing. Audio sample uploads will not work.')
}

module.exports.getMinioClient = () => minioClient
module.exports.getBucketName = () => bucketName
module.exports.getStorageUrl = () => {
  if (!storageUrl) return null
  return storageUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
// Scheme of the configured storage host. Production hosts are https; a local
// MinIO dev server is reached over http. Defaults to https when unset so
// existing deployments are unaffected.
module.exports.getStorageScheme = () => {
  if (!storageUrl) return 'https'
  return storageUrl.startsWith('http://') ? 'http' : 'https'
}

module.exports.ensureBucket = ensureBucket
