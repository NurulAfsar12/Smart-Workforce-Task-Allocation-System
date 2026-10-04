/** Error that carries an HTTP status code to the error handler. */
class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg = 'Bad request', details = null) {
    return new ApiError(400, msg, details);
  }

  static unauthorized(msg = 'Authentication required') {
    return new ApiError(401, msg);
  }

  static forbidden(msg = 'You do not have permission to perform this action') {
    return new ApiError(403, msg);
  }

  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }

  static conflict(msg = 'Resource already exists') {
    return new ApiError(409, msg);
  }

  /** 422 - the request was understood but violates a business rule. */
  static unprocessable(msg = 'Business rule violated', details = null) {
    return new ApiError(422, msg, details);
  }
}

module.exports = ApiError;