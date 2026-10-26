const { NewsApiProvider } = require('./newsapi.provider');
const { UnconfiguredNewsProvider } = require('./unconfigured.provider');

function createNewsProvider(newsConfig) {
    if (!newsConfig.apiKey) {
        return new UnconfiguredNewsProvider();
    }
    return new NewsApiProvider({
        apiKey: newsConfig.apiKey,
        baseUrl: newsConfig.baseUrl,
        timeoutMs: newsConfig.requestTimeoutMs,
        pageSize: newsConfig.pageSize,
    });
}

module.exports = { createNewsProvider };
