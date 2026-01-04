const Minio = require('minio')
const logger = require('fomoplayer_shared').logger(__filename)

const storageUrl = process.env.AUDIO_SAMPLE_STORAGE_HOST
const accessKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_ACCESS_KEY
const secretKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_SECRET_KEY
const bucketName = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_NAME

let minioClient = null

if (storageUrl && accessKey && secretKey) {
  const [endPoint, port] = storageUrl.replace(/^https?:\/\//, '').split(':')
  const useSSL = storageUrl.includes('https://')
  
  minioClient = new Minio.Client({
    endPoint: endPoint,
    port: port,
    accessKey: accessKey,
    secretKey: secretKey,
    useSSL: useSSL,
  })

  if (bucketName) {
    minioClient.bucketExists(bucketName).then((exists) => {
      if (!exists) {
        logger.warn(`MinIO bucket ${bucketName} does not exist`)
      }
    }).catch((err) => {
      logger.error('Error checking MinIO bucket existence', err)
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

