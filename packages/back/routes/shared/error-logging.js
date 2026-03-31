const isPostgresError = (error) => {
  return (
    error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(error.code)
  )
}

const sanitizeDbErrorContext = (error) => {
  if (!error || typeof error !== 'object') {
    return {}
  }

  return {
    code: error.code,
    severity: error.severity,
    schema: error.schema,
    table: error.table,
    column: error.column,
    constraint: error.constraint,
    routine: error.routine,
  }
}

const logRequestError = (logger, err, requestContext) => {
  if (isPostgresError(err)) {
    logger.error('Database query failed', {
      ...requestContext,
      dbError: sanitizeDbErrorContext(err),
    })
    return
  }

  logger.error(typeof err === 'string' ? err : err?.toString?.() || 'Unknown error', {
    ...requestContext,
    stack: err?.stack,
  })
}

module.exports = {
  isPostgresError,
  sanitizeDbErrorContext,
  logRequestError,
}
