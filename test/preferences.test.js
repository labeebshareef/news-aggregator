const tap = require('tap');
const { buildTestApp, signupAndLogin } = require('./helpers/test-app');

tap.test('preferences', async (t) => {
    const { request } = buildTestApp();
    const authorization = await signupAndLogin(request);

    t.test('returns the preferences given at signup with the default language', async (t) => {
        const response = await request.get('/users/preferences').set('Authorization', authorization);
        t.equal(response.status, 200);
        t.same(response.body, { preferences: ['movies', 'games'], language: 'en' });
    });

    t.test('normalizes topics: trims and removes case-insensitive duplicates in order', async (t) => {
        const response = await request
            .put('/users/preferences')
            .set('Authorization', authorization)
            .send({ preferences: [' Technology ', 'science', 'TECHNOLOGY'] });
        t.equal(response.status, 200);
        t.same(response.body.preferences, ['Technology', 'science']);
    });

    t.test('updates the language when provided and keeps it otherwise', async (t) => {
        await request.put('/users/preferences').set('Authorization', authorization)
            .send({ preferences: ['movies'], language: 'FR' }).expect(200);
        await request.put('/users/preferences').set('Authorization', authorization)
            .send({ preferences: ['movies', 'comics'] }).expect(200);

        const response = await request.get('/users/preferences').set('Authorization', authorization);
        t.same(response.body, { preferences: ['movies', 'comics'], language: 'fr' });
    });

    t.test('can change only the language', async (t) => {
        const response = await request.put('/users/preferences').set('Authorization', authorization).send({ language: 'de' });
        t.equal(response.status, 200);
        t.same(response.body.preferences, ['movies', 'comics'], 'topics are unchanged');
        t.equal(response.body.language, 'de');
    });

    t.test('accepts an empty list to clear preferences', async (t) => {
        const response = await request.put('/users/preferences').set('Authorization', authorization).send({ preferences: [] });
        t.equal(response.status, 200);
        t.same(response.body.preferences, []);
    });

    const invalidCases = [
        ['an empty body', {}],
        ['preferences that are a string', { preferences: 'movies' }],
        ['preferences with a number', { preferences: ['movies', 1] }],
        ['preferences with an empty string', { preferences: ['  '] }],
        ['more than 20 preferences', { preferences: Array.from({ length: 21 }, (_, i) => `topic${i}`) }],
        ['a preference longer than 50 characters', { preferences: ['x'.repeat(51)] }],
        ['an unsupported language', { preferences: ['movies'], language: 'xx' }],
        ['a body that is an array', ['movies']],
    ];
    for (const [label, body] of invalidCases) {
        t.test(`rejects ${label} with 400`, async (t) => {
            const response = await request.put('/users/preferences').set('Authorization', authorization).send(body);
            t.equal(response.status, 400);
            t.equal(response.body.error.code, 'VALIDATION_ERROR');
        });
    }

    t.test('keeps each user\'s preferences separate', async (t) => {
        const other = await signupAndLogin(request, {
            name: 'Bruce Wayne', email: 'bruce@wayne.com', password: 'B4tcave!', preferences: ['business'],
        });
        const response = await request.get('/users/preferences').set('Authorization', other);
        t.same(response.body.preferences, ['business']);
    });
});
