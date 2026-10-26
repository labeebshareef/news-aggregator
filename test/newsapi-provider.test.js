const tap = require('tap');
const { NewsApiProvider } = require('../src/providers/newsapi.provider');
const { buildTopicQuery } = require('../src/services/news.service');

function providerWith(get) {
    const requests = [];
    const httpClient = {
        async get(url, options) {
            requests.push({ url, params: options.params });
            return get(url, options);
        },
    };
    return { provider: new NewsApiProvider({ pageSize: 10, httpClient }), requests };
}

function httpError(status, message) {
    return Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data: { status: 'error', message } },
    });
}

tap.test('NewsApiProvider', async (t) => {
    t.test('queries /everything and normalizes articles', async (t) => {
        const { provider, requests } = providerWith(async () => ({
            data: {
                articles: [
                    {
                        title: 'A headline',
                        description: 'Details',
                        url: 'https://example.com/a',
                        urlToImage: 'https://example.com/a.jpg',
                        source: { id: null, name: 'Example' },
                        author: 'Reporter',
                        publishedAt: '2026-10-01T00:00:00Z',
                    },
                    { title: '[Removed]', url: 'https://removed.com' },
                    { title: 'No url' },
                ],
            },
        }));

        const articles = await provider.searchArticles({ query: 'movies OR comics', language: 'en' });
        t.same(requests, [{
            url: '/everything',
            params: { q: 'movies OR comics', language: 'en', sortBy: 'publishedAt', pageSize: 10 },
        }]);
        t.equal(articles.length, 1, 'drops removed and incomplete articles');
        t.match(articles[0], {
            id: /^[a-f0-9]{16}$/,
            title: 'A headline',
            imageUrl: 'https://example.com/a.jpg',
            source: 'Example',
        });
    });

    t.test('uses top headlines when there is no query', async (t) => {
        const { provider, requests } = providerWith(async () => ({ data: { articles: [] } }));
        await provider.searchArticles({ query: '', language: 'en' });
        t.equal(requests[0].url, '/top-headlines');
    });

    const errorCases = [
        ['rate limiting', httpError(429, 'rateLimited'), 503],
        ['an invalid API key', httpError(401, 'apiKeyInvalid'), 502],
        ['a server error', httpError(500, 'unexpectedError'), 502],
        ['a timeout', Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), 504],
    ];
    for (const [label, error, status] of errorCases) {
        t.test(`maps ${label} to ${status}`, async (t) => {
            const { provider } = providerWith(async () => { throw error; });
            const rejection = await provider.searchArticles({ query: 'x', language: 'en' }).catch((e) => e);
            t.match(rejection, { statusCode: status, code: 'NEWS_PROVIDER_ERROR' });
            t.notMatch(rejection.message, /apiKey|status code|timeout$/, 'provider internals stay out of the client message');
        });
    }
});

tap.test('buildTopicQuery', async (t) => {
    t.equal(buildTopicQuery(['movies', 'Comics']), '"comics" OR "movies"');
    t.equal(buildTopicQuery(['video games']), '"video games"');
    t.equal(buildTopicQuery(['NOT "politics"', '-sports']), '"-sports" OR "not politics"', 'user text cannot become query syntax');
    t.equal(buildTopicQuery([]), '');
    const long = buildTopicQuery(Array.from({ length: 20 }, (_, i) => `${'x'.repeat(45)}${i}`));
    t.ok(long.length <= 500, 'stays within the provider query limit');
});
