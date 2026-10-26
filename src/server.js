/**
 * Starts the HTTP server and the background cache refresher, and shuts both
 * down cleanly on SIGINT/SIGTERM so in-flight requests can finish.
 */
function startServer(app) {
    const { config, logger, newsRefresher } = app.locals.container;

    if (config.auth.usingDevSecret) {
        logger.warn('JWT_SECRET is not set; using an insecure development secret');
    }
    if (!config.news.apiKey) {
        logger.warn('NEWS_API_KEY is not set; news endpoints will return no articles until it is configured');
    }

    const server = app.listen(config.port, () => {
        logger.info('Server is listening', { port: config.port, env: config.env });
    });
    server.on('error', (error) => {
        logger.error('Server failed to start', { message: error.message });
        process.exit(1);
    });

    newsRefresher.start();

    const shutdown = (signal) => {
        logger.info('Shutting down', { signal });
        // Force exit if open connections keep the server from closing.
        setTimeout(() => process.exit(1), 10000).unref();
        server.close(async () => {
            await newsRefresher.stop();
            process.exit(0);
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    return server;
}

module.exports = { startServer };
