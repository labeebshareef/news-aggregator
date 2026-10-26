const crypto = require('node:crypto');

/**
 * In-memory user store. The async interface matches what a database-backed
 * repository would expose, so services do not change when persistence does.
 * Records are copied on the way in and out so callers can never mutate stored state.
 */
class InMemoryUserRepository {
    constructor() {
        this.usersById = new Map();
        this.idsByEmail = new Map();
    }

    async create({ name, email, passwordHash, preferences, language }) {
        if (this.idsByEmail.has(email)) {
            // Mirrors a unique-index violation; the service checks first, this guards against races.
            throw Object.assign(new Error(`Email already exists: ${email}`), { code: 'DUPLICATE_EMAIL' });
        }
        const now = new Date().toISOString();
        const user = {
            id: crypto.randomUUID(),
            name,
            email,
            passwordHash,
            preferences: [...preferences],
            language,
            createdAt: now,
            updatedAt: now,
        };
        this.usersById.set(user.id, user);
        this.idsByEmail.set(email, user.id);
        return clone(user);
    }

    async findById(id) {
        return clone(this.usersById.get(id));
    }

    async findByEmail(email) {
        return this.findById(this.idsByEmail.get(email));
    }

    async update(id, changes) {
        const user = this.usersById.get(id);
        if (!user) return null;
        Object.assign(user, structuredClone(changes), { updatedAt: new Date().toISOString() });
        return clone(user);
    }
}

function clone(user) {
    return user ? structuredClone(user) : null;
}

module.exports = { InMemoryUserRepository };
