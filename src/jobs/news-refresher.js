/**
 * Periodically refreshes cached news in the background, the way a real-time
 * aggregator keeps its feed warm. Only queries read within the last
 * `activeWindowMs` are refreshed, and at most `maxQueries` per run, so idle
 * users do not burn the provider's daily quota.
 */
class NewsRefresher {
    constructor({ newsService, logger, intervalMs, activeWindowMs, maxQueries = 25 }) {
        this.newsService = newsService;
        this.logger = logger;
        this.intervalMs = intervalMs;
        this.activeWindowMs = activeWindowMs;
        this.maxQueries = maxQueries;
        this.timer = null;
        this.running = null;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.runOnce(), this.intervalMs);
        // Never keep the process alive just for this timer.
        this.timer.unref();
        this.logger.info('News refresher started', { intervalMs: this.intervalMs });
    }

    async stop() {
        clearInterval(this.timer);
        this.timer = null;
        await this.running;
    }

    /** Runs one refresh pass; if a pass is still in progress, waits for it instead of overlapping. */
    runOnce() {
        if (!this.running) {
            this.running = this.newsService
                .refreshActiveQueries({ activeWindowMs: this.activeWindowMs, maxQueries: this.maxQueries })
                .then((result) => {
                    if (result.refreshed || result.failed) this.logger.info('News cache refreshed', result);
                    return result;
                })
                .catch((error) => {
                    this.logger.error('News refresh pass crashed', { message: error.message });
                    return { refreshed: 0, failed: 0 };
                })
                .finally(() => {
                    this.running = null;
                });
        }
        return this.running;
    }
}

module.exports = { NewsRefresher };
