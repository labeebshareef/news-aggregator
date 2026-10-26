/** Express 4 does not forward rejected promises to the error handler, so route handlers are wrapped. */
const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
