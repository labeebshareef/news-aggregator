/**
 * In-memory TTL cache with the behaviours the news service relies on:
 *
 *  - Request coalescing: concurrent misses for one key share a single loader call,
 *    so a burst of requests costs one external API call, not N.
 *  - Stale fallback: an expired entry is kept, and served if reloading it fails,
 *    so a provider outage degrades to slightly old news instead of an error.
 *  - Background refresh: each entry remembers its loader, so a scheduler can
 *    reload the keys people are actually reading before they expire.
 *  - Bounded size: least recently used keys are evicted beyond maxEntries.
 *
 * `now` is injectable so expiry can be tested without waiting.
 */
class TtlCache {
    constructor({ ttlMs, maxEntries = 500, now = Date.now }) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.now = now;
        this.entries = new Map(); // key -> { value, loader, expiresAt, lastAccessedAt }
        this.inFlight = new Map(); // key -> Promise
    }

    /**
     * Returns { value, source } where source is "cache", "origin" or "stale".
     * Loader errors propagate only when there is no stale value to fall back on.
     */
    async getOrLoad(key, loader) {
        const entry = this.entries.get(key);
        if (entry) this.touch(key, entry);

        if (entry && entry.expiresAt > this.now()) {
            return { value: entry.value, source: 'cache' };
        }
        try {
            const value = await this.load(key, loader);
            return { value, source: 'origin' };
        } catch (error) {
            if (entry) return { value: entry.value, source: 'stale' };
            throw error;
        }
    }

    /** Reloads a cached key with its stored loader, regardless of freshness. */
    async refresh(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        return this.load(key, entry.loader);
    }

    /** Keys read within the last `windowMs`, most recently read first. */
    activeKeys(windowMs) {
        const since = this.now() - windowMs;
        return [...this.entries]
            .filter(([, entry]) => entry.lastAccessedAt >= since)
            .map(([key]) => key)
            .reverse();
    }

    load(key, loader) {
        if (this.inFlight.has(key)) return this.inFlight.get(key);

        const promise = Promise.resolve()
            .then(loader)
            .then((value) => {
                this.set(key, value, loader);
                return value;
            })
            .finally(() => this.inFlight.delete(key));

        this.inFlight.set(key, promise);
        return promise;
    }

    set(key, value, loader) {
        const previous = this.entries.get(key);
        const now = this.now();
        this.entries.delete(key);
        this.entries.set(key, {
            value,
            loader,
            expiresAt: now + this.ttlMs,
            // A background refresh must not make an abandoned key look active.
            lastAccessedAt: previous ? previous.lastAccessedAt : now,
        });
        while (this.entries.size > this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value);
        }
    }

    // Map preserves insertion order, so re-inserting moves a key to the most-recent end.
    touch(key, entry) {
        entry.lastAccessedAt = this.now();
        this.entries.delete(key);
        this.entries.set(key, entry);
    }

    get size() {
        return this.entries.size;
    }
}

module.exports = { TtlCache };
