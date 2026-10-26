const tap = require('tap');
const jwt = require('jsonwebtoken');
const { buildTestApp, validUser, signupAndLogin } = require('./helpers/test-app');

tap.test('signup', async (t) => {
    const { request } = buildTestApp();

    t.test('returns the created user without the password hash', async (t) => {
        const response = await request.post('/users/signup').send(validUser);
        t.equal(response.status, 200);
        t.equal(response.body.user.email, validUser.email);
        t.same(response.body.user.preferences, validUser.preferences);
        t.notOk('password' in response.body.user);
        t.notOk('passwordHash' in response.body.user);
    });

    t.test('rejects a duplicate email regardless of case with 409', async (t) => {
        const response = await request.post('/users/signup').send({ ...validUser, email: 'DIANA@Themyscira.com' });
        t.equal(response.status, 409);
        t.equal(response.body.error.code, 'CONFLICT');
    });

    t.test('defaults preferences to an empty list', async (t) => {
        const { preferences, ...withoutPreferences } = validUser;
        const response = await request.post('/users/signup').send({ ...withoutPreferences, email: 'nopref@example.com' });
        t.equal(response.status, 200);
        t.same(response.body.user.preferences, []);
    });

    const invalidCases = [
        ['missing name', { name: undefined }, 'name'],
        ['invalid email format', { email: 'not-an-email' }, 'email'],
        ['password shorter than 8 characters', { password: 'Ab1' }, 'password'],
        ['password without a number', { password: 'onlyletters' }, 'password'],
        ['password longer than bcrypt allows', { password: `A1${'x'.repeat(80)}` }, 'password'],
        ['email of the wrong type', { email: 42 }, 'email'],
        ['preferences that are not an array', { preferences: 'movies' }, 'preferences'],
        ['preferences containing non-strings', { preferences: ['movies', 7] }, 'preferences'],
    ];
    for (const [label, change, field] of invalidCases) {
        t.test(`rejects ${label} with 400`, async (t) => {
            const response = await request.post('/users/signup').send({ ...validUser, email: 'new@example.com', ...change });
            t.equal(response.status, 400);
            t.equal(response.body.error.code, 'VALIDATION_ERROR');
            t.ok(response.body.error.details.some((detail) => detail.field === field), `reports the ${field} field`);
        });
    }

    t.test('rejects malformed JSON with 400 instead of a stack trace', async (t) => {
        const response = await request.post('/users/signup').set('Content-Type', 'application/json').send('{"name": ');
        t.equal(response.status, 400);
        t.equal(response.body.error.code, 'INVALID_JSON');
    });
});

tap.test('login', async (t) => {
    const { request } = buildTestApp();
    await request.post('/users/signup').send(validUser).expect(200);

    t.test('returns a bearer token with its expiry', async (t) => {
        const response = await request.post('/users/login').send({ email: validUser.email, password: validUser.password });
        t.equal(response.status, 200);
        t.equal(response.body.tokenType, 'Bearer');
        t.ok(Date.parse(response.body.expiresAt) > Date.now());
        t.equal(jwt.decode(response.body.token).sub, response.body.user.id);
    });

    t.test('gives the same 401 for a wrong password and an unknown email', async (t) => {
        const wrongPassword = await request.post('/users/login').send({ email: validUser.email, password: 'Wrong-passw0rd' });
        const unknownEmail = await request.post('/users/login').send({ email: 'nobody@example.com', password: validUser.password });
        t.equal(wrongPassword.status, 401);
        t.equal(unknownEmail.status, 401);
        t.same(wrongPassword.body, unknownEmail.body, 'does not reveal which emails are registered');
    });

    t.test('rejects a missing password with 400', async (t) => {
        const response = await request.post('/users/login').send({ email: validUser.email });
        t.equal(response.status, 400);
    });
});

tap.test('protected routes', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);

    const unauthorizedCases = [
        ['no Authorization header', undefined],
        ['a non-Bearer scheme', authorization.replace('Bearer', 'Basic')],
        ['a tampered token', `${authorization}x`],
        ['a token signed with another secret', `Bearer ${jwt.sign({ sub: 'someone' }, 'other-secret')}`],
        ['an expired token', `Bearer ${jwt.sign({ sub: 'someone', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret')}`],
        ['a valid token for a user that does not exist', `Bearer ${jwt.sign({ sub: 'missing-user' }, 'test-secret')}`],
    ];
    for (const [label, header] of unauthorizedCases) {
        t.test(`returns 401 for ${label}`, async (t) => {
            const req = request.get('/users/preferences');
            if (header) req.set('Authorization', header);
            const response = await req;
            t.equal(response.status, 401);
            t.equal(response.body.error.code, 'UNAUTHORIZED');
        });
    }

    t.test('tells the client when the token has expired', async (t) => {
        const expired = jwt.sign({ sub: 'someone', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');
        const response = await request.get('/news').set('Authorization', `Bearer ${expired}`);
        t.match(response.body.error.message, /expired/);
    });
});

tap.test('rate limits repeated login attempts', async (t) => {
    const { request } = buildTestApp({ env: { AUTH_RATE_LIMIT_MAX: '3' } });
    const attempt = () => request.post('/users/login').send({ email: validUser.email, password: 'Wrong-passw0rd' });
    for (let i = 0; i < 3; i += 1) {
        t.equal((await attempt()).status, 401);
    }
    const blocked = await attempt();
    t.equal(blocked.status, 429);
    t.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
});

tap.test('successful logins do not count towards the rate limit', async (t) => {
    const { request } = buildTestApp({ env: { AUTH_RATE_LIMIT_MAX: '2' } });
    await request.post('/users/signup').send(validUser).expect(200);
    for (let i = 0; i < 4; i += 1) {
        await request.post('/users/login').send({ email: validUser.email, password: validUser.password }).expect(200);
    }
    t.pass('four logins succeeded under a limit of two');
});

tap.test('unsupported body charset returns 415', async (t) => {
    const { request } = buildTestApp();
    const response = await request.post('/users/login')
        .set('Content-Type', 'application/json; charset=latin1')
        .send(JSON.stringify({ email: validUser.email, password: validUser.password }));
    t.equal(response.status, 415);
    t.equal(response.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
});

tap.test('rejects an invalid JWT_EXPIRES_IN at startup', async (t) => {
    t.throws(() => buildTestApp({ env: { JWT_EXPIRES_IN: 'abc' } }), /JWT_EXPIRES_IN/);
});

tap.test('unknown routes return a JSON 404', async (t) => {
    const { request } = buildTestApp();
    const response = await request.get('/does-not-exist');
    t.equal(response.status, 404);
    t.equal(response.body.error.code, 'NOT_FOUND');
});
