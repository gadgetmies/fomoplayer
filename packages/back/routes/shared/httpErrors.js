class HttpError extends Error {
  constructor(message) {
    super()
    this.message = message
  }

  getCode() {
    if (this instanceof BadRequest) {
      return 400
    } else if (this instanceof Unauthorized) {
      return 401
    } else if (this instanceof Forbidden) {
      return 403
    } else if (this instanceof NotFound) {
      return 404
    }
    return 500
  }
}

class BadRequest extends HttpError {}
class Unauthorized extends HttpError {}
class Forbidden extends HttpError {}
class NotFound extends HttpError {}

// Maps an error thrown by a route to the response sent to the client. Store
// clients flag rate limits and block pages with isRateLimit; those are a
// temporary outage of the store, not a server error.
const errorResponse = (err) => {
  if (err instanceof HttpError) return { code: err.getCode(), message: err.message }
  if (err.isRateLimit) {
    return { code: 503, message: 'The store is temporarily unavailable. Try again in a few minutes.' }
  }
  return { code: 500, message: 'Internal server error' }
}

module.exports = {
  errorResponse,
  HttpError,
  BadRequest,
  Unauthorized,
  NotFound,
  Forbidden,
}
