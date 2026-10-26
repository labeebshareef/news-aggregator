/**
 * Errors that are safe to show to API clients. Anything else reaching the
 * error handler is treated as an unexpected 500 and its details stay in the logs.
 */
class AppError extends Error {
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

class ValidationError extends AppError {
    constructor(details, message = 'Request validation failed') {
        super(400, 'VALIDATION_ERROR', message, details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(401, 'UNAUTHORIZED', message);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(404, 'NOT_FOUND', message);
    }
}

class ConflictError extends AppError {
    constructor(message) {
        super(409, 'CONFLICT', message);
    }
}

/** The external news provider failed; statusCode is 502, 503 or 504. */
class UpstreamError extends AppError {
    constructor(message, statusCode = 502) {
        super(statusCode, 'NEWS_PROVIDER_ERROR', message);
    }
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    NotFoundError,
    ConflictError,
    UpstreamError,
};
