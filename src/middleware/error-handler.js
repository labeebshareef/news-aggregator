const { AppError, NotFoundError } = require('../utils/errors');

function notFound(req, res, next) {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

// Client errors raised by Express or body-parser before a route handler runs.
const FRAMEWORK_ERRORS = {
    'entity.parse.failed': [400, 'INVALID_JSON', 'Request body is not valid JSON'],
    'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'],
    'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body charset is not supported'],
    'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body encoding is not supported'],
};

/**
 * Single place that turns errors into responses. Every error body has the same shape:
 *   { "error": { "code": "...", "message": "...", "details": [...] } }
 */
function createErrorHandler(logger) {
    // `next` is unused but must stay: Express recognises error handlers by their four parameters.
    return function errorHandler(error, req, res, next) {
        const send = (status, code, message, details) => {
            const body = { code, message };
            if (details) body.details = details;
            return res.status(status).json({ error: body });
        };

        if (FRAMEWORK_ERRORS[error.type]) {
            return send(...FRAMEWORK_ERRORS[error.type]);
        }

        if (error instanceof AppError) {
            if (error.statusCode >= 500) {
                logger.warn('Request failed', {
                    method: req.method, path: req.originalUrl, code: error.code, message: error.message, cause: error.cause,
                });
            }
            return send(error.statusCode, error.code, error.message, error.details);
        }

        // Other client errors from the framework, e.g. a path with malformed percent-encoding.
        if (error.status >= 400 && error.status < 500) {
            return send(error.status, 'BAD_REQUEST', error.message);
        }

        logger.error('Unhandled error', { method: req.method, path: req.originalUrl, message: error.message, stack: error.stack });
        return send(500, 'INTERNAL_ERROR', 'Something went wrong');
    };
}

module.exports = { notFound, createErrorHandler };
