const supertest = require('supertest');
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { SampleNewsProvider } = require('./sample-news-provider');

/**
 * Builds an isolated app (fresh in-memory stores) with deterministic config:
 * offline fixture news, silent logs, fast bcrypt. `overrides` replaces any container dependency;
 * pass `newsProvider: null` to get the provider the app picks itself (none, as no key is set).
 */
function buildTestApp({ env = {}, ...overrides } = {}) {
    const config = loadConfig({
        NODE_ENV: 'test',
        NEWS_API_KEY: '',
        LOG_LEVEL: 'silent',
        BCRYPT_SALT_ROUNDS: '4',
        JWT_SECRET: 'test-secret',
        ...env,
    });
    const { newsProvider = new SampleNewsProvider(), ...rest } = overrides;
    const app = createApp({ config, ...rest, ...(newsProvider && { newsProvider }) });
    return { app, request: supertest(app), container: app.locals.container };
}

const validUser = Object.freeze({
    name: 'Diana Prince',
    email: 'diana@themyscira.com',
    password: 'Amaz0nian',
    preferences: ['movies', 'games'],
});

/** Signs up and logs in, returning an Authorization header value. */
async function signupAndLogin(request, user = validUser) {
    await request.post('/users/signup').send(user).expect(200);
    const response = await request.post('/users/login').send({ email: user.email, password: user.password }).expect(200);
    return `Bearer ${response.body.token}`;
}

module.exports = { buildTestApp, validUser, signupAndLogin };
