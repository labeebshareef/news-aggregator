require('dotenv').config();

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

// Same formats jsonwebtoken accepts for expiresIn: seconds ("3600") or a number with a unit ("15m", "1h", "7d").
const EXPIRES_IN_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || 'development';

    if (nodeEnv === 'production' && !env.JWT_SECRET) {
        throw new Error('JWT_SECRET must be set when NODE_ENV=production');
    }

    const jwtExpiresIn = env.JWT_EXPIRES_IN || '1h';
    if (!EXPIRES_IN_PATTERN.test(jwtExpiresIn)) {
        throw new Error(`JWT_EXPIRES_IN "${jwtExpiresIn}" is invalid, use seconds or a value like "15m", "1h", "7d"`);
    }

    return Object.freeze({
        env: nodeEnv,
        port: toInt(env.PORT, 3000),
        logLevel: env.LOG_LEVEL || 'info',
        auth: {
            jwtSecret: env.JWT_SECRET || DEV_JWT_SECRET,
            jwtExpiresIn: /^\d+$/.test(jwtExpiresIn) ? Number(jwtExpiresIn) : jwtExpiresIn,
            bcryptSaltRounds: toInt(env.BCRYPT_SALT_ROUNDS, 10),
            usingDevSecret: !env.JWT_SECRET,
        },
        rateLimit: {
            windowMs: toInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
            max: toInt(env.AUTH_RATE_LIMIT_MAX, 20),
        },
        news: {
            apiKey: env.NEWS_API_KEY || '',
            baseUrl: env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
            requestTimeoutMs: toInt(env.NEWS_API_TIMEOUT_MS, 5000),
            pageSize: toInt(env.NEWS_PAGE_SIZE, 20),
            defaultLanguage: 'en',
        },
        cache: {
            ttlMs: toInt(env.NEWS_CACHE_TTL_MS, 10 * 60 * 1000),
            maxEntries: toInt(env.NEWS_CACHE_MAX_ENTRIES, 500),
            refreshIntervalMs: toInt(env.NEWS_REFRESH_INTERVAL_MS, 5 * 60 * 1000),
            refreshActiveWindowMs: toInt(env.NEWS_REFRESH_ACTIVE_WINDOW_MS, 30 * 60 * 1000),
            refreshMaxQueries: toInt(env.NEWS_REFRESH_MAX_QUERIES, 25),
        },
    });
}

module.exports = { loadConfig };
