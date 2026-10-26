const rules = require('./rules');

/**
 * Each validator receives the raw input and returns { value, errors }.
 * `value` is the normalized payload the service layer works with; services never see raw req.body.
 */

function collect(checks) {
    return checks
        .filter(([, message]) => message)
        .map(([field, message]) => ({ field, message }));
}

function validateSignup(body) {
    if (!rules.isPlainObject(body)) {
        return { errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
    }
    const { name, email, password, preferences = [] } = body;
    const errors = collect([
        ['name', rules.requiredString(name, { field: 'name', max: 100 })],
        ['email', rules.email(email)],
        ['password', rules.strongPassword(password)],
        ['preferences', rules.preferenceList(preferences)],
    ]);
    if (errors.length) return { errors };

    return {
        value: {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            preferences: rules.normalizePreferences(preferences),
        },
        errors: [],
    };
}

function validateLogin(body) {
    if (!rules.isPlainObject(body)) {
        return { errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
    }
    const { email, password } = body;
    // Only presence is checked here: strength rules belong to signup, and a weak guess
    // at login is simply a wrong password (401), not a malformed request.
    const errors = collect([
        ['email', rules.email(email)],
        ['password', rules.requiredString(password, { field: 'password', max: 1024 })],
    ]);
    if (errors.length) return { errors };

    return { value: { email: email.trim().toLowerCase(), password }, errors: [] };
}

function validatePreferencesUpdate(body) {
    if (!rules.isPlainObject(body)) {
        return { errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
    }
    const { preferences, language } = body;
    if (preferences === undefined && language === undefined) {
        return { errors: [{ field: 'preferences', message: 'provide preferences, language, or both' }] };
    }
    const errors = collect([
        ['preferences', preferences === undefined ? null : rules.preferenceList(preferences)],
        ['language', language === undefined ? null : rules.language(language)],
    ]);
    if (errors.length) return { errors };

    // Only the fields that were sent are changed.
    const value = {};
    if (preferences !== undefined) value.preferences = rules.normalizePreferences(preferences);
    if (language !== undefined) value.language = language.trim().toLowerCase();
    return { value, errors: [] };
}

module.exports = { validateSignup, validateLogin, validatePreferencesUpdate };
