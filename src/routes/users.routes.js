const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { validateSignup, validateLogin, validatePreferencesUpdate } = require('../validators/user.validators');

function createUsersRouter({ controller, authenticate, rateLimitConfig }) {
    const router = express.Router();

    // Slows down password guessing and signup spam; counted per client IP.
    const limiter = (options) => rateLimit({
        windowMs: rateLimitConfig.windowMs,
        limit: rateLimitConfig.max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, please try again later' } },
        ...options,
    });

    router.post('/signup', limiter(), validate(validateSignup), asyncHandler(controller.signup));
    // Only failed logins count, so a user who logs in normally is never locked out.
    router.post('/login', limiter({ skipSuccessfulRequests: true }), validate(validateLogin), asyncHandler(controller.login));

    router.get('/preferences', authenticate, asyncHandler(controller.getPreferences));
    router.put('/preferences', authenticate, validate(validatePreferencesUpdate), asyncHandler(controller.updatePreferences));

    return router;
}

module.exports = { createUsersRouter };
