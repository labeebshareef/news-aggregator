const rules = require('./rules');

const ARTICLE_ID_PATTERN = /^[a-f0-9]{16}$/;

function validateArticleParams(params) {
    const { id } = params;
    if (typeof id !== 'string' || !ARTICLE_ID_PATTERN.test(id)) {
        return { errors: [{ field: 'id', message: 'id must be a 16 character article id as returned by GET /news' }] };
    }
    return { value: { id }, errors: [] };
}

function validateSearchParams(params) {
    const message = rules.requiredString(params.keyword, { field: 'keyword', min: 2, max: 100 });
    if (message) return { errors: [{ field: 'keyword', message }] };
    return { value: { keyword: params.keyword.trim() }, errors: [] };
}

module.exports = { validateArticleParams, validateSearchParams };
