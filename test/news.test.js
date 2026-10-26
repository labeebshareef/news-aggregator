const tap = require('tap');
const { buildTestApp, signupAndLogin } = require('./helpers/test-app');
const { createArticle } = require('../src/providers/article');
const { UpstreamError } = require('../src/utils/errors');

/** Provider double that records calls and can be switched into a failing state. */
function createFakeProvider() {
    const provider = {
        name: 'fake',
        isConfigured: true,
        calls: [],
        failWith: null,
        async searchArticles(query) {
            provider.calls.push(query);
            if (provider.failWith) throw provider.failWith;
            return [createArticle({ title: `About ${query.query}`, url: `https://example.com/${provider.calls.length}`, publishedAt: '2026-10-01T00:00:00Z' })];
        },
    };
    return provider;
}

tap.test('GET /news without a configured news provider', async (t) => {
    const { request } = buildTestApp({ newsProvider: null });
    const authorization = await signupAndLogin(request);

    const response = await request.get('/news').set('Authorization', authorization);
    t.equal(response.status, 200);
    t.same(response.body.news, [], 'returns no articles rather than made-up ones');
    t.match(response.body.notice, /NEWS_API_KEY/);
});

tap.test('GET /news with fixture articles', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);

    const response = await request.get('/news').set('Authorization', authorization);
    t.equal(response.status, 200);
    t.ok(response.body.news.length > 0, 'returns articles');
    t.equal(response.body.count, response.body.news.length);
    t.ok(
        response.body.news.every((article) => /\/(movies|games)\//.test(article.url)),
        'only articles about the user\'s topics (movies, games)',
    );
    for (const article of response.body.news) {
        t.match(article, { id: /^[a-f0-9]{16}$/, title: String, url: String, isRead: false, isFavorite: false });
    }
});

tap.test('GET /news follows the user\'s language preference', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);
    await request.put('/users/preferences').set('Authorization', authorization)
        .send({ preferences: ['movies'], language: 'fr' }).expect(200);

    const response = await request.get('/news').set('Authorization', authorization);
    t.equal(response.status, 200);
    t.ok(response.body.news.length > 0);
    t.ok(response.body.news.every((article) => article.url.includes('/fr/')), 'only French articles');
});

tap.test('caching', async (t) => {
    const newsProvider = createFakeProvider();
    const { request } = buildTestApp({ newsProvider });
    const authorization = await signupAndLogin(request);

    const first = await request.get('/news').set('Authorization', authorization);
    const second = await request.get('/news').set('Authorization', authorization);
    t.equal(first.headers['x-cache'], 'MISS');
    t.equal(second.headers['x-cache'], 'HIT');
    t.same(second.body.news, first.body.news);
    t.equal(newsProvider.calls.length, 1, 'the provider is called once for repeated requests');
    t.same(newsProvider.calls[0], { query: '"games" OR "movies"', language: 'en' });

    t.test('users with the same topics in another order share the cache entry', async (t) => {
        const other = await signupAndLogin(request, {
            name: 'Barry Allen', email: 'barry@ccpd.com', password: 'Sp33dforce', preferences: ['games', 'movies'],
        });
        const response = await request.get('/news').set('Authorization', other);
        t.equal(response.headers['x-cache'], 'HIT');
        t.equal(newsProvider.calls.length, 1);
    });

    t.test('changing preferences produces a new query', async (t) => {
        await request.put('/users/preferences').set('Authorization', authorization)
            .send({ preferences: ['science', 'space exploration'] }).expect(200);
        const response = await request.get('/news').set('Authorization', authorization);
        t.equal(response.headers['x-cache'], 'MISS');
        t.same(newsProvider.calls.at(-1), { query: '"science" OR "space exploration"', language: 'en' });
    });
});

tap.test('news provider failures', async (t) => {
    const newsProvider = createFakeProvider();
    const { request, container } = buildTestApp({ newsProvider, env: { NEWS_CACHE_TTL_MS: '1' } });
    const authorization = await signupAndLogin(request);

    t.test('maps a provider outage with nothing cached to its HTTP status', async (t) => {
        newsProvider.failWith = new UpstreamError('News provider rate limit reached, try again later', 503);
        const response = await request.get('/news/search/elections').set('Authorization', authorization);
        t.equal(response.status, 503);
        t.equal(response.body.error.code, 'NEWS_PROVIDER_ERROR');
    });

    t.test('serves stale articles when a refresh fails', async (t) => {
        newsProvider.failWith = null;
        const fresh = await request.get('/news').set('Authorization', authorization);
        t.equal(fresh.status, 200);

        await new Promise((resolve) => setTimeout(resolve, 5)); // let the 1ms TTL lapse
        newsProvider.failWith = new UpstreamError('News provider timed out', 504);
        const stale = await request.get('/news').set('Authorization', authorization);
        t.equal(stale.status, 200);
        t.equal(stale.headers['x-cache'], 'STALE');
        t.same(stale.body.news, fresh.body.news);
    });

    t.test('unexpected errors become a generic 500', async (t) => {
        newsProvider.failWith = new Error('socket hang up');
        container.newsCache.entries.clear();
        const response = await request.get('/news').set('Authorization', authorization);
        t.equal(response.status, 500);
        t.same(response.body, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    });
});

tap.test('search', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);

    t.test('finds articles by keyword', async (t) => {
        const response = await request.get('/news/search/comics').set('Authorization', authorization);
        t.equal(response.status, 200);
        t.equal(response.body.keyword, 'comics');
        t.ok(response.body.news.length > 0);
        t.ok(response.body.news.every((article) => /comic/i.test(`${article.title} ${article.description}`)));
    });

    t.test('returns an empty list when nothing matches', async (t) => {
        const response = await request.get('/news/search/zzzznomatch').set('Authorization', authorization);
        t.equal(response.status, 200);
        t.same(response.body.news, []);
    });

    t.test('treats query syntax in a keyword as plain text', async (t) => {
        const newsProvider = createFakeProvider();
        const app = buildTestApp({ newsProvider });
        const auth = await signupAndLogin(app.request);
        await app.request.get('/news/search/(cats AND dogs').set('Authorization', auth).expect(200);
        t.same(newsProvider.calls[0].query, '"(cats and dogs"');
    });

    t.test('rejects malformed percent-encoding with 400', async (t) => {
        const response = await request.get('/news/search/%E0%A4%A').set('Authorization', authorization);
        t.equal(response.status, 400);
        t.equal(response.body.error.code, 'BAD_REQUEST');
    });

    t.test('rejects a one-character keyword', async (t) => {
        const response = await request.get('/news/search/a').set('Authorization', authorization);
        t.equal(response.status, 400);
    });

    t.test('requires authentication', async (t) => {
        const response = await request.get('/news/search/comics');
        t.equal(response.status, 401);
    });
});

tap.test('read and favorite articles', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);
    const { body } = await request.get('/news').set('Authorization', authorization);
    const [first, second] = body.news;

    t.test('marks articles as read and lists them newest first', async (t) => {
        await request.post(`/news/${first.id}/read`).set('Authorization', authorization).expect(200);
        const response = await request.post(`/news/${second.id}/read`).set('Authorization', authorization);
        t.equal(response.status, 200);
        t.equal(response.body.article.id, second.id);

        const list = await request.get('/news/read').set('Authorization', authorization);
        t.equal(list.status, 200);
        t.same(list.body.news.map((article) => article.id), [second.id, first.id]);
        t.ok(list.body.news.every((article) => article.addedAt));
    });

    t.test('marking twice is idempotent', async (t) => {
        const response = await request.post(`/news/${first.id}/read`).set('Authorization', authorization);
        t.equal(response.status, 200);
        t.match(response.body.message, /already/);
        const list = await request.get('/news/read').set('Authorization', authorization);
        t.equal(list.body.count, 2);
    });

    t.test('favorites can be added, listed and removed', async (t) => {
        await request.post(`/news/${first.id}/favorite`).set('Authorization', authorization).expect(200);
        let list = await request.get('/news/favorites').set('Authorization', authorization);
        t.same(list.body.news.map((article) => article.id), [first.id]);

        await request.delete(`/news/${first.id}/favorite`).set('Authorization', authorization).expect(204);
        list = await request.get('/news/favorites').set('Authorization', authorization);
        t.same(list.body.news, []);

        const again = await request.delete(`/news/${first.id}/favorite`).set('Authorization', authorization);
        t.equal(again.status, 404);
    });

    t.test('GET /news reflects read and favorite state', async (t) => {
        await request.post(`/news/${second.id}/favorite`).set('Authorization', authorization).expect(200);
        const response = await request.get('/news').set('Authorization', authorization);
        const byId = Object.fromEntries(response.body.news.map((article) => [article.id, article]));
        t.match(byId[first.id], { isRead: true, isFavorite: false });
        t.match(byId[second.id], { isRead: true, isFavorite: true });
    });

    t.test('lists are private to each user', async (t) => {
        const other = await signupAndLogin(request, {
            name: 'Hal Jordan', email: 'hal@oa.com', password: 'Gr33nLantern', preferences: [],
        });
        const read = await request.get('/news/read').set('Authorization', other);
        const favorites = await request.get('/news/favorites').set('Authorization', other);
        t.same(read.body.news, []);
        t.same(favorites.body.news, []);
    });

    t.test('rejects an unknown article id with 404', async (t) => {
        const response = await request.post('/news/0123456789abcdef/read').set('Authorization', authorization);
        t.equal(response.status, 404);
    });

    t.test('rejects a malformed article id with 400', async (t) => {
        const response = await request.post('/news/not-an-id/favorite').set('Authorization', authorization);
        t.equal(response.status, 400);
    });

    t.test('requires authentication', async (t) => {
        t.equal((await request.post(`/news/${first.id}/read`)).status, 401);
        t.equal((await request.get('/news/favorites')).status, 401);
    });
});
