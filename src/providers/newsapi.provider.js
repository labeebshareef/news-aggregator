const axios = require('axios');
const { createArticle } = require('./article');
const { UpstreamError } = require('../utils/errors');

/**
 * Client for https://newsapi.org (v2), called directly with axios.
 * Every provider exposes the same method:
 *   searchArticles({ query, language }) -> Promise<Article[]>
 */
class NewsApiProvider {
    constructor({ apiKey, baseUrl, timeoutMs, pageSize, httpClient }) {
        this.name = 'newsapi';
        this.isConfigured = true;
        this.pageSize = pageSize;
        this.http = httpClient || axios.create({
            baseURL: baseUrl,
            timeout: timeoutMs,
            headers: { 'X-Api-Key': apiKey },
        });
    }

    async searchArticles({ query, language }) {
        // Without topics there is nothing to search for, so fall back to general top headlines
        // (that endpoint filters by country rather than language).
        const request = query
            ? { url: '/everything', params: { q: query, language, sortBy: 'publishedAt', pageSize: this.pageSize } }
            : { url: '/top-headlines', params: { category: 'general', country: 'us', pageSize: this.pageSize } };

        let response;
        try {
            response = await this.http.get(request.url, { params: request.params });
        } catch (error) {
            throw toUpstreamError(error);
        }

        const articles = Array.isArray(response.data?.articles) ? response.data.articles : [];
        return articles
            // NewsAPI marks articles from sources that asked to be removed as "[Removed]".
            .filter((item) => item.url && item.title && item.title !== '[Removed]')
            .map((item) => createArticle({
                title: item.title,
                description: item.description,
                url: item.url,
                imageUrl: item.urlToImage,
                source: item.source?.name,
                author: item.author,
                publishedAt: item.publishedAt,
            }));
    }
}

/**
 * Converts axios failures into errors safe to show clients. The provider's own message
 * (which can name hosts or our account) is attached as `cause` for the logs only.
 */
function toUpstreamError(error) {
    let upstream;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        upstream = new UpstreamError('News provider timed out', 504);
    } else if (error.response?.status === 429) {
        upstream = new UpstreamError('News provider rate limit reached, try again later', 503);
    } else {
        // Includes 401 (our API key, not the client's) and network failures.
        upstream = new UpstreamError('News provider request failed', 502);
    }
    upstream.cause = error.response?.data?.message || error.message;
    return upstream;
}

module.exports = { NewsApiProvider };
