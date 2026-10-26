const { UnauthorizedError } = require('../utils/errors');

/**
 * Verifies the "Authorization: Bearer <jwt>" header and attaches the current user as req.user.
 * Applied to every route that reads or writes per-user data.
 */
function createAuthenticate(authService) {
    return async function authenticate(req, res, next) {
        try {
            // The auth scheme name is case-insensitive (RFC 7235).
            const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
            if (!match) {
                throw new UnauthorizedError('Missing or malformed Authorization header, expected "Bearer <token>"');
            }
            req.user = await authService.verifyToken(match[1]);
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { createAuthenticate };
