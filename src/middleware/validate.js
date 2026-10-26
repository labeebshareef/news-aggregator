const { ValidationError } = require('../utils/errors');

/**
 * Runs a validator against req[source] and exposes the normalized result as req.validated.
 * Handlers read from req.validated only, so unvalidated input cannot leak into a service.
 */
const validate = (validator, source = 'body') => (req, res, next) => {
    const { value, errors } = validator(req[source]);
    if (errors.length) {
        return next(new ValidationError(errors));
    }
    req.validated = { ...req.validated, ...value };
    return next();
};

module.exports = { validate };
