/**
 * Used when no NEWS_API_KEY is set. The API still starts and every route works,
 * but news endpoints return no articles (with a notice) rather than made-up ones.
 */
class UnconfiguredNewsProvider {
    constructor() {
        this.name = 'none';
        this.isConfigured = false;
    }

    async searchArticles() {
        return [];
    }
}

module.exports = { UnconfiguredNewsProvider };
