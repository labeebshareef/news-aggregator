const crypto = require('node:crypto');

/**
 * External APIs do not give articles an id, so one is derived from the URL.
 * The same story always gets the same id, across requests, cache refreshes and restarts.
 */
function articleIdFor(url) {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** Shape every provider must return. Routes and services only ever see this shape. */
function createArticle({ title, description, url, imageUrl, source, author, publishedAt }) {
    return {
        id: articleIdFor(url),
        title: title || '',
        description: description || '',
        url,
        imageUrl: imageUrl || null,
        source: source || null,
        author: author || null,
        publishedAt: publishedAt || null,
    };
}

module.exports = { articleIdFor, createArticle };
