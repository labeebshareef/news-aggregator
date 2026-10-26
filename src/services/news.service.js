const { NotFoundError } = require('../utils/errors');

// NewsAPI rejects `q` values longer than 500 characters.
const MAX_QUERY_LENGTH = 500;

/**
 * Builds a provider query from a list of topics: `"comics" OR "movies" OR "video games"`.
 * Every term is quoted as an exact phrase, so user text can never act as query syntax
 * (AND, NOT, parentheses, +/- prefixes). Terms are lowercased and sorted so users with the
 * same topics in a different order or case share a cache entry.
 */
function buildTopicQuery(topics) {
    const terms = [...new Set(topics.map((topic) => topic.replace(/"/g, '').trim().toLowerCase()))]
        .filter(Boolean)
        .sort()
        .map((term) => `"${term}"`);
    let query = '';
    for (const term of terms) {
        const next = query ? `${query} OR ${term}` : term;
        if (next.length > MAX_QUERY_LENGTH) break;
        query = next;
    }
    return query;
}

class NewsService {
    constructor({ newsProvider, cache, articleRepository, readingListRepository, logger }) {
        this.provider = newsProvider;
        this.cache = cache;
        this.articles = articleRepository;
        this.readingLists = readingListRepository;
        this.logger = logger;
    }

    /** News for the user's saved preferences (or top headlines when they have none). */
    async getNewsForUser(user) {
        const query = buildTopicQuery(user.preferences);
        return this.fetch(user, `news:${user.language}:${query}`, { query, language: user.language });
    }

    async searchForUser(user, keyword) {
        const normalized = keyword.toLowerCase();
        return this.fetch(user, `search:${user.language}:${normalized}`, {
            query: buildTopicQuery([normalized]),
            language: user.language,
        });
    }

    async fetch(user, cacheKey, providerQuery) {
        const loader = async () => {
            const articles = await this.provider.searchArticles(providerQuery);
            await this.articles.saveMany(articles);
            return articles;
        };
        const { value, source } = await this.cache.getOrLoad(cacheKey, loader);
        if (source === 'stale') {
            this.logger.warn('Serving stale news after provider failure', { cacheKey });
        }
        const result = { articles: await this.withUserState(user.id, value), source };
        if (!this.provider.isConfigured) {
            result.notice = 'No news provider is configured (NEWS_API_KEY is not set), so no articles are available';
        }
        return result;
    }

    /** Adds isRead / isFavorite flags so clients can render state without extra calls. */
    async withUserState(userId, articles) {
        const [readIds, favoriteIds] = await Promise.all([
            this.readingLists.ids(userId, 'read'),
            this.readingLists.ids(userId, 'favorites'),
        ]);
        return articles.map((article) => ({
            ...article,
            isRead: readIds.has(article.id),
            isFavorite: favoriteIds.has(article.id),
        }));
    }

    async addToList(userId, list, articleId) {
        const article = await this.articles.findById(articleId);
        if (!article) {
            throw new NotFoundError(`Article ${articleId} not found. Use an id returned by GET /news or a search.`);
        }
        const added = await this.readingLists.add(userId, list, article);
        return { article, added };
    }

    async removeFromList(userId, list, articleId) {
        const removed = await this.readingLists.remove(userId, list, articleId);
        if (!removed) throw new NotFoundError(`Article ${articleId} is not in your ${list}`);
    }

    async getList(userId, list) {
        return this.readingLists.list(userId, list);
    }

    /**
     * Reloads the cached queries people read recently, so they get fresh articles
     * without waiting on the provider. Runs sequentially to stay gentle on API quotas.
     */
    async refreshActiveQueries({ activeWindowMs, maxQueries }) {
        const keys = this.cache.activeKeys(activeWindowMs).slice(0, maxQueries);
        let refreshed = 0;
        let failed = 0;
        for (const key of keys) {
            try {
                await this.cache.refresh(key);
                refreshed += 1;
            } catch (error) {
                failed += 1;
                this.logger.warn('Background news refresh failed', { cacheKey: key, message: error.message });
            }
        }
        return { refreshed, failed };
    }
}

module.exports = { NewsService, buildTopicQuery };
