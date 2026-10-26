const tap = require('tap');
const { TtlCache } = require('../src/cache/ttl-cache');
const { NewsService } = require('../src/services/news.service');
const { NewsRefresher } = require('../src/jobs/news-refresher');
const { createLogger } = require('../src/utils/logger');

function createClock(start = 0) {
    let time = start;
    return { now: () => time, advance: (ms) => { time += ms; } };
}

tap.test('TtlCache', async (t) => {
    t.test('serves from cache until the TTL expires, then reloads', async (t) => {
        const clock = createClock();
        const cache = new TtlCache({ ttlMs: 1000, now: clock.now });
        let loads = 0;
        const loader = async () => ++loads;

        t.same(await cache.getOrLoad('k', loader), { value: 1, source: 'origin' });
        clock.advance(999);
        t.same(await cache.getOrLoad('k', loader), { value: 1, source: 'cache' });
        clock.advance(1);
        t.same(await cache.getOrLoad('k', loader), { value: 2, source: 'origin' });
    });

    t.test('coalesces concurrent misses into one load', async (t) => {
        const cache = new TtlCache({ ttlMs: 1000 });
        let loads = 0;
        const loader = () => new Promise((resolve) => setTimeout(() => resolve(++loads), 10));

        const results = await Promise.all([1, 2, 3, 4, 5].map(() => cache.getOrLoad('k', loader)));
        t.equal(loads, 1);
        t.ok(results.every((result) => result.value === 1));
    });

    t.test('falls back to the stale value when reloading fails', async (t) => {
        const clock = createClock();
        const cache = new TtlCache({ ttlMs: 1000, now: clock.now });
        await cache.getOrLoad('k', async () => 'old');
        clock.advance(2000);

        const result = await cache.getOrLoad('k', async () => { throw new Error('provider down'); });
        t.same(result, { value: 'old', source: 'stale' });
    });

    t.test('propagates the error when there is nothing stale to serve', async (t) => {
        const cache = new TtlCache({ ttlMs: 1000 });
        await t.rejects(cache.getOrLoad('k', async () => { throw new Error('provider down'); }), /provider down/);
        t.equal(cache.size, 0, 'failed loads are not cached');
    });

    t.test('evicts the least recently used key beyond maxEntries', async (t) => {
        const cache = new TtlCache({ ttlMs: 1000, maxEntries: 2 });
        await cache.getOrLoad('a', async () => 'a');
        await cache.getOrLoad('b', async () => 'b');
        await cache.getOrLoad('a', async () => 'a'); // a is now most recently used
        await cache.getOrLoad('c', async () => 'c');
        t.same(cache.activeKeys(Infinity).sort(), ['a', 'c']);
    });

    t.test('refresh reloads a key with its stored loader', async (t) => {
        const cache = new TtlCache({ ttlMs: 1000 });
        let version = 0;
        await cache.getOrLoad('k', async () => ++version);
        t.equal(await cache.refresh('k'), 2);
        t.same(await cache.getOrLoad('k', async () => 'unused'), { value: 2, source: 'cache' });
        t.equal(await cache.refresh('missing'), undefined);
    });
});

tap.test('background refresh', async (t) => {
    const clock = createClock(1_000_000);
    const cache = new TtlCache({ ttlMs: 60_000, now: clock.now });
    const calls = [];
    const newsProvider = {
        isConfigured: true,
        async searchArticles(query) {
            calls.push(query.query);
            if (query.query === 'broken') throw new Error('provider down');
            return [];
        },
    };
    const newsService = new NewsService({
        newsProvider,
        cache,
        articleRepository: { saveMany: async () => {} },
        readingListRepository: { ids: async () => new Set() },
        logger: createLogger('silent'),
    });
    const refresher = new NewsRefresher({
        newsService,
        logger: createLogger('silent'),
        intervalMs: 60_000,
        activeWindowMs: 30 * 60_000,
    });
    const user = (preferences) => ({ id: 'u1', language: 'en', preferences });

    await newsService.getNewsForUser(user(['idle']));
    clock.advance(31 * 60_000); // "idle" has not been read for longer than the active window
    await newsService.getNewsForUser(user(['movies']));
    await newsService.getNewsForUser(user(['sports']));
    calls.length = 0;

    const result = await refresher.runOnce();
    t.same(calls.sort(), ['"movies"', '"sports"'], 'only recently read queries are refreshed');
    t.same(result, { refreshed: 2, failed: 0 });

    t.test('a failing query does not stop the others', async (t) => {
        await cache.getOrLoad('broken', async () => []); // seed an entry whose reload fails
        cache.entries.get('broken').loader = () => newsProvider.searchArticles({ query: 'broken' });
        calls.length = 0;
        const outcome = await refresher.runOnce();
        t.same(outcome, { refreshed: 2, failed: 1 });
    });

    t.test('overlapping runs share one pass', async (t) => {
        const [a, b] = [refresher.runOnce(), refresher.runOnce()];
        t.equal(a, b);
        await a;
    });

    t.test('start and stop manage a timer that does not hold the process open', async (t) => {
        refresher.start();
        t.ok(refresher.timer);
        t.equal(refresher.timer.hasRef(), false);
        await refresher.stop();
        t.equal(refresher.timer, null);
    });
});
