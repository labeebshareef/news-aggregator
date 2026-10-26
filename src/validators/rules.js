/**
 * Small composable field rules. Each rule returns an error message, or null when the value passes.
 * Kept dependency-free so every validation decision is visible in this codebase.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requiredString(value, { field, min = 1, max = 255 }) {
    if (value === undefined || value === null) return `${field} is required`;
    if (typeof value !== 'string') return `${field} must be a string`;
    const length = value.trim().length;
    if (length < min) return min === 1 ? `${field} must not be empty` : `${field} must be at least ${min} characters`;
    if (length > max) return `${field} must be at most ${max} characters`;
    return null;
}

function email(value) {
    const error = requiredString(value, { field: 'email', max: 254 });
    if (error) return error;
    return EMAIL_PATTERN.test(value.trim()) ? null : 'email must be a valid email address';
}

function strongPassword(value) {
    if (value === undefined || value === null) return 'password is required';
    if (typeof value !== 'string') return 'password must be a string';
    if (value.length < 8) return 'password must be at least 8 characters';
    // bcrypt silently ignores everything after 72 bytes, so reject longer input instead.
    if (Buffer.byteLength(value, 'utf8') > 72) return 'password must be at most 72 bytes';
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'password must contain at least one letter and one number';
    return null;
}

const MAX_PREFERENCES = 20;
const MAX_PREFERENCE_LENGTH = 50;

function preferenceList(value) {
    if (!Array.isArray(value)) return 'preferences must be an array of strings';
    if (value.length > MAX_PREFERENCES) return `preferences must contain at most ${MAX_PREFERENCES} items`;
    for (const [index, item] of value.entries()) {
        if (typeof item !== 'string') return `preferences[${index}] must be a string`;
        const length = item.trim().length;
        if (length === 0) return `preferences[${index}] must not be empty`;
        if (length > MAX_PREFERENCE_LENGTH) return `preferences[${index}] must be at most ${MAX_PREFERENCE_LENGTH} characters`;
    }
    return null;
}

/** Trims and removes case-insensitive duplicates, keeping the first spelling and the user's order. */
function normalizePreferences(list) {
    const seen = new Set();
    return list
        .map((item) => item.trim())
        .filter((item) => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

// Languages accepted by the NewsAPI /everything endpoint.
const SUPPORTED_LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'he', 'it', 'nl', 'no', 'pt', 'ru', 'sv', 'ud', 'zh'];

function language(value) {
    if (typeof value !== 'string') return 'language must be a string';
    return SUPPORTED_LANGUAGES.includes(value.trim().toLowerCase())
        ? null
        : `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`;
}

module.exports = {
    isPlainObject,
    requiredString,
    email,
    strongPassword,
    preferenceList,
    normalizePreferences,
    language,
};
