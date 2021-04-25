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

module.exports = {
  HttpError,
  BadRequest,
  Unauthorized,
  NotFound,
  Forbidden
}
