import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'

// The user's uploaded audio samples and what the backend knows about them.

const ALLOWED_TYPES = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3']
const ALLOWED_EXTENSIONS = ['.wav', '.mp3']
const MAX_SIZE = 10 * 1024 * 1024

export const loadAudioSamples = () => requestJSONwithCredentials({ path: '/me/notifications/audio-samples' })

// Throws with a message the UI can show when the file is rejected or the upload fails.
export const uploadAudioSample = async (file) => {
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error('Invalid file type. Only WAV and MP3 files are allowed.')
  }
  if (file.size > MAX_SIZE) {
    throw new Error(`File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
  }
  const formData = new FormData()
  formData.append('audioFile', file)
  const response = await fetch(`${apiURL}/me/notifications/audio-samples`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'Upload failed')
  }
  return response.json()
}

export const deleteAudioSample = (sampleId) =>
  requestWithCredentials({ path: `/me/notifications/audio-samples/${sampleId}`, method: 'DELETE' })

export const loadSampleMatches = (sampleId) =>
  requestJSONwithCredentials({ path: `/me/notifications/audio-samples/${sampleId}/matches` })

export const loadSimilarToSample = (sampleId) =>
  requestJSONwithCredentials({ path: `/me/notifications/audio-samples/${sampleId}/similar?limit=20` })

export const loadNotificationEvents = () => requestJSONwithCredentials({ path: '/me/notifications/events?limit=100' })

export const loadUnreadNotificationCount = async () =>
  (await requestJSONwithCredentials({ path: '/me/notifications/events/unread-count' })).count

export const markAllNotificationsRead = () =>
  requestJSONwithCredentials({ path: '/me/notifications/events/read', method: 'POST', body: { all: true } })
