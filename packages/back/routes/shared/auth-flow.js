const getRequestOrigin = (req) => {
  const forwardedProto = req.get('x-forwarded-proto')
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol
  const host = req.get('x-forwarded-host') || req.get('host')
  return `${protocol}://${host}`
}

const parseReturnUrl = (returnUrl) => {
  if (!returnUrl) {
    return undefined
  }

  try {
    return new URL(returnUrl)
  } catch (_) {
    return undefined
  }
}

const isAllowedReturnUrl = (returnUrl, allowedOrigins, allowedOriginRegexes) => {
  const parsed = parseReturnUrl(returnUrl)
  if (!parsed) {
    return false
  }

  if (allowedOrigins.includes(parsed.origin)) {
    return true
  }

  return allowedOriginRegexes.some((regex) => regex.test(parsed.origin))
}

const consumeInviteCode = async (inviteCode, deleteInviteCode) => {
  const deleteCount = await deleteInviteCode(inviteCode)
  if (deleteCount === 1) {
    return true
  }
  if (deleteCount === 0) {
    return false
  }
  throw new Error('Consumed more than one invite code')
}

const evaluateSignUpPolicy = async ({
  inviteCode,
  queryAccountCount,
  maxAccountCount,
  deleteInviteCode,
}) => {
  const signUpAvailable = (await queryAccountCount()) <= maxAccountCount
  if (signUpAvailable) {
    return { allowed: true }
  }

  if (!inviteCode) {
    return { allowed: false, error: 'sign_up_not_available' }
  }

  const inviteCodeConsumed = await consumeInviteCode(inviteCode, deleteInviteCode)
  if (!inviteCodeConsumed) {
    return { allowed: false, error: 'invalid_invite_code' }
  }

  return { allowed: true }
}

const isGoogleSubAllowed = ({ isPreviewEnv, previewAllowedGoogleSubs, googleSub }) => {
  if (!isPreviewEnv) {
    return true
  }

  if (!googleSub) {
    return false
  }

  return previewAllowedGoogleSubs.includes(googleSub)
}

module.exports = {
  getRequestOrigin,
  parseReturnUrl,
  isAllowedReturnUrl,
  consumeInviteCode,
  evaluateSignUpPolicy,
  isGoogleSubAllowed,
}

