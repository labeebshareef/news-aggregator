const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ConflictError, UnauthorizedError } = require('../utils/errors');
const { toPublicUser } = require('./user.view');

const INVALID_CREDENTIALS = 'Invalid email or password';

class AuthService {
    constructor({ userRepository, config }) {
        this.users = userRepository;
        this.jwtSecret = config.auth.jwtSecret;
        this.jwtExpiresIn = config.auth.jwtExpiresIn;
        this.saltRounds = config.auth.bcryptSaltRounds;
        this.defaultLanguage = config.news.defaultLanguage;
        this.dummyHash = null;
    }

    async register({ name, email, password, preferences }) {
        if (await this.users.findByEmail(email)) {
            throw new ConflictError('An account with this email already exists');
        }
        const passwordHash = await bcrypt.hash(password, this.saltRounds);
        try {
            const user = await this.users.create({
                name,
                email,
                passwordHash,
                preferences,
                language: this.defaultLanguage,
            });
            return toPublicUser(user);
        } catch (error) {
            // Two signups for one email can both pass the check above; the store has the final say.
            if (error.code === 'DUPLICATE_EMAIL') throw new ConflictError('An account with this email already exists');
            throw error;
        }
    }

    async login({ email, password }) {
        const user = await this.users.findByEmail(email);
        // Compare against a dummy hash for unknown emails so response time does not reveal
        // which addresses are registered, and return the same message in both cases.
        const hash = user ? user.passwordHash : await this.getDummyHash();
        const matches = await bcrypt.compare(password, hash);
        if (!user || !matches) {
            throw new UnauthorizedError(INVALID_CREDENTIALS);
        }

        const token = jwt.sign({ sub: user.id }, this.jwtSecret, {
            expiresIn: this.jwtExpiresIn,
            algorithm: 'HS256',
        });
        const { exp } = jwt.decode(token);
        return { token, tokenType: 'Bearer', expiresAt: new Date(exp * 1000).toISOString(), user: toPublicUser(user) };
    }

    /** Resolves a bearer token to the current user, or throws UnauthorizedError. */
    async verifyToken(token) {
        let payload;
        try {
            payload = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
        } catch (error) {
            const message = error.name === 'TokenExpiredError' ? 'Token has expired, please log in again' : 'Invalid token';
            throw new UnauthorizedError(message);
        }

        const user = await this.users.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedError('User for this token no longer exists');
        }
        return toPublicUser(user);
    }

    async getDummyHash() {
        if (!this.dummyHash) {
            this.dummyHash = await bcrypt.hash('dummy-password-for-timing', this.saltRounds);
        }
        return this.dummyHash;
    }
}

module.exports = { AuthService };
