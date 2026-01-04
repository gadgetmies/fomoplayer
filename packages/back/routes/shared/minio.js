const Minio = require('minio')
const logger = require('fomoplayer_shared').logger(__filename)

const storageUrl = process.env.AUDIO_SAMPLE_STORAGE_HOST
const accessKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_ACCESS_KEY
const secretKey = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_SECRET_KEY
const bucketName = process.env.AUDIO_SAMPLE_STORAGE_BUCKET_NAME

let minioClient = null

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

