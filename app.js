const { createApp } = require('./src/app');
const { startServer } = require('./src/server');

const app = createApp();

// Listen only when run directly (`npm start`); tests import the app and drive it with supertest.
if (require.main === module) {
    startServer(app);
}

module.exports = app;
