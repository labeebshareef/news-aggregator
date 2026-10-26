const express = require('express');
const helmet = require('helmet');
const { createContainer } = require('./container');
const { createAuthenticate } = require('./middleware/authenticate');
const { notFound, createErrorHandler } = require('./middleware/error-handler');
const { createUsersController } = require('./controllers/users.controller');
const { createNewsController } = require('./controllers/news.controller');
const { createUsersRouter } = require('./routes/users.routes');
const { createNewsRouter } = require('./routes/news.routes');

/** Builds the Express app without listening, so tests can drive it with supertest. */
function createApp(overrides = {}) {
    const container = createContainer(overrides);
    const app = express();

    app.disable('x-powered-by');
    app.use(helmet());
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', newsProvider: container.newsProvider.name, uptimeSeconds: Math.round(process.uptime()) });
    });

    const authenticate = createAuthenticate(container.authService);

    app.use('/users', createUsersRouter({
        controller: createUsersController(container),
        authenticate,
        rateLimitConfig: container.config.rateLimit,
    }));
    app.use('/news', createNewsRouter({
        controller: createNewsController(container),
        authenticate,
    }));

    app.use(notFound);
    app.use(createErrorHandler(container.logger));

    // Exposed for the server entry point (background jobs, shutdown) and for tests.
    app.locals.container = container;
    return app;
}

module.exports = { createApp };
