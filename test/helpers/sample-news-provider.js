const sampleArticles = require('../fixtures/sample-articles.json');
const { createArticle } = require('../../src/providers/article');

/**
 * Test double for the news provider: answers queries offline from a fixed set of
 * fixture articles, so tests are deterministic and need no API key or network.
 * It accepts the same `"a" OR "b c"` queries the news service sends to NewsAPI
 * and matches whole words in each article's title, description and tags.
 */
class SampleNewsProvider {
    constructor({ articles = sampleArticles } = {}) {
        this.name = 'sample';
        this.isConfigured = true;
        this.articles = articles.map((item) => ({
            article: createArticle(item),
            text: ` ${[item.title, item.description, ...(item.tags || [])].join(' ').toLowerCase()} `,
            language: item.language || 'en',
        }));
    }

    async searchArticles({ query, language }) {
        const terms = parseQuery(query);
        return this.articles
            .filter((item) => item.language === language)
            .filter((item) => terms.length === 0 || terms.some((term) => containsWord(item.text, term)))
            .map((item) => item.article)
            .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
}

function parseQuery(query) {
    if (!query) return [];
    return query
        .split(/\s+OR\s+/)
        .map((term) => term.replace(/"/g, '').trim().toLowerCase())
        .filter(Boolean);
}

function containsWord(text, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`[^\\p{L}\\p{N}]${escaped}[^\\p{L}\\p{N}]`, 'u').test(text);
}

module.exports = { SampleNewsProvider };
