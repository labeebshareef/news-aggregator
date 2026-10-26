const { NotFoundError } = require('../utils/errors');

class PreferencesService {
    constructor({ userRepository }) {
        this.users = userRepository;
    }

    async get(userId) {
        const user = await this.users.findById(userId);
        if (!user) throw new NotFoundError('User not found');
        return { preferences: user.preferences, language: user.language };
    }

    /** Replaces the topic list and/or the language; fields left out keep their current value. */
    async update(userId, changes) {
        const user = await this.users.update(userId, changes);
        if (!user) throw new NotFoundError('User not found');
        return { preferences: user.preferences, language: user.language };
    }
}

module.exports = { PreferencesService };
