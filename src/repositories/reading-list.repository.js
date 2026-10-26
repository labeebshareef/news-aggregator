const LISTS = ['read', 'favorites'];

/**
 * Per-user "read" and "favorites" lists. Each entry stores a snapshot of the article,
 * so a user's lists stay intact after the article drops out of the news cache.
 */
class InMemoryReadingListRepository {
    constructor() {
        this.listsByUser = new Map();
    }

    listsFor(userId) {
        if (!this.listsByUser.has(userId)) {
            this.listsByUser.set(userId, { read: new Map(), favorites: new Map() });
        }
        return this.listsByUser.get(userId);
    }

    /** Adds the article to a list. Returns false when it was already there (the call is idempotent). */
    async add(userId, list, article) {
        assertList(list);
        const entries = this.listsFor(userId)[list];
        if (entries.has(article.id)) return false;
        entries.set(article.id, { article: structuredClone(article), addedAt: new Date().toISOString() });
        return true;
    }

    async remove(userId, list, articleId) {
        assertList(list);
        return this.listsFor(userId)[list].delete(articleId);
    }

    /** Most recently added first. */
    async list(userId, list) {
        assertList(list);
        return [...this.listsFor(userId)[list].values()]
            .reverse()
            .map(({ article, addedAt }) => ({ ...structuredClone(article), addedAt }));
    }

    async ids(userId, list) {
        assertList(list);
        return new Set(this.listsFor(userId)[list].keys());
    }
}

function assertList(list) {
    if (!LISTS.includes(list)) throw new Error(`Unknown reading list "${list}"`);
}

module.exports = { InMemoryReadingListRepository };
