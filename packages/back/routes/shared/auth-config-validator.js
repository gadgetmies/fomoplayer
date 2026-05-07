const validateAuthConfig = ({
  oidcHandoffSecret,
  apiOrigin,
  oidcHandoffAuthorityOrigin,
  allowedPreviewOriginRegexes,
}) => {
  const canMintHandoff = Boolean(oidcHandoffSecret && apiOrigin)
  const looksLikeHandoffConsumer = Boolean(
    oidcHandoffAuthorityOrigin &&
      apiOrigin &&
      oidcHandoffAuthorityOrigin !== apiOrigin,
  )

  if (canMintHandoff && (!Array.isArray(allowedPreviewOriginRegexes) || allowedPreviewOriginRegexes.length === 0)) {
    throw new Error(
      'Handoff issuer enabled (OIDC_HANDOFF_SECRET set, apiOrigin known) but ALLOWED_PREVIEW_ORIGIN_REGEX is empty. Every handoff target would be rejected with reason: handoff-target-unsafe / subReason: allowlist-not-configured. Set ALLOWED_PREVIEW_ORIGIN_REGEX to a regex matching your PR-preview origins (e.g. "^https://<service>-<project>-pr-\\d+\\.up\\.railway\\.app$") or unset OIDC_HANDOFF_SECRET to disable the handoff issuer role.',
    )
  }

  if (looksLikeHandoffConsumer && !oidcHandoffSecret) {
    throw new Error(
      `AUTH_API_URL resolves to ${oidcHandoffAuthorityOrigin}, which differs from this backend's apiOrigin (${apiOrigin}) — this backend looks like a handoff consumer — but OIDC_HANDOFF_SECRET is not set. Without the secret, handoff delegation is disabled and /login/google would fall through to a local OIDC flow whose callbackURL points at the authority, producing "Unable to verify authorization request state." Set OIDC_HANDOFF_SECRET to match the authority, or unset AUTH_API_URL if this backend is not a handoff consumer.`,
    )
  }
}

module.exports = { validateAuthConfig }
