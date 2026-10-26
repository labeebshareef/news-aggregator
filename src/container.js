const { loadConfig } = require('./config');
const { createLogger } = require('./utils/logger');
const { TtlCache } = require('./cache/ttl-cache');
const { createNewsProvider } = require('./providers');
const { InMemoryUserRepository } = require('./repositories/user.repository');
const { InMemoryArticleRepository } = require('./repositories/article.repository');
const { InMemoryReadingListRepository } = require('./repositories/reading-list.repository');
const { AuthService } = require('./services/auth.service');
const { PreferencesService } = require('./services/preferences.service');
const { NewsService } = require('./services/news.service');
const { NewsRefresher } = require('./jobs/news-refresher');

/**
 * Composition root: the one place where concrete implementations are chosen and wired.
 * Anything can be swapped through `overrides` (tests pass a fake news provider this way).
 */
function createContainer(overrides = {}) {
    const config = overrides.config || loadConfig();
    const logger = overrides.logger || createLogger(config.logLevel);

    const userRepository = overrides.userRepository || new InMemoryUserRepository();
    const articleRepository = overrides.articleRepository || new InMemoryArticleRepository();
    const readingListRepository = overrides.readingListRepository || new InMemoryReadingListRepository();
    const newsProvider = overrides.newsProvider || createNewsProvider(config.news);
    const newsCache = overrides.newsCache || new TtlCache({ ttlMs: config.cache.ttlMs, maxEntries: config.cache.maxEntries });

    const authService = new AuthService({ userRepository, config });
    const preferencesService = new PreferencesService({ userRepository });
    const newsService = new NewsService({
        newsProvider,
        cache: newsCache,
        articleRepository,
        readingListRepository,
        logger,
    });
    const newsRefresher = new NewsRefresher({
        newsService,
        logger,
        intervalMs: config.cache.refreshIntervalMs,
        activeWindowMs: config.cache.refreshActiveWindowMs,
        maxQueries: config.cache.refreshMaxQueries,
    });

    return {
        config,
        logger,
        newsProvider,
        newsCache,
        authService,
        preferencesService,
        newsService,
        newsRefresher,
    };
}

module.exports = { createContainer };
