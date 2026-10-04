/**
 * Turns PostgreSQL error codes into meaningful HTTP responses.
 * Keeping this in one place means controllers never need to know about
 * PostgreSQL error codes.
 */
function normaliseError(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return { status: 409, message: 'A record with these values already exists', details: err.detail };

    case '23503': // foreign_key_violation
      return {
        status: 409,
        message: 'Related record does not exist, or is still referenced by other records',
        details: err.detail,
      };

    case '23514': // check_violation (includes our trigger rules)
      return { status: 422, message: err.message.replace(/^.*?\]\s*/, '') || 'Check constraint failed' };

    case '23502': // not_null_violation
      return { status: 400, message: `Missing required field: ${err.column}` };

    case '22P02': // invalid_text_representation (bad enum / number)
      return { status: 400, message: `Invalid value for ${err.column}: ${err.message}` };

    case 'P0002': // no_data_found
      return { status: 404, message: 'Record not found' };

    case 'P0001': // raise_exception from our own functions
      return { status: 422, message: err.message };

    case '22001': // string_data_right_truncation
      return { status: 400, message: 'A field value is too long for its column' };

    case 'ECONNREFUSED':
      return { status: 503, message: 'Database connection refused' };

    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const normalised = normaliseError(err);

  if (normalised) {
    return res.status(normalised.status).json({
      success: false,
      message: normalised.message,
      ...(normalised.details ? { details: normalised.details } : {}),
    });
  }

  console.error('[error]', req.method, req.originalUrl, err);
  return res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFoundHandler };