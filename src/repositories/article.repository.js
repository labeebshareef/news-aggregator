/**
 * Catalog of every article the API has handed out, keyed by its stable id.
 * Read/favorite endpoints only accept ids from this catalog, so a client cannot
 * mark an article it never received. Oldest entries are evicted beyond maxEntries.
 */
class InMemoryArticleRepository {
    constructor({ maxEntries = 5000 } = {}) {
        this.maxEntries = maxEntries;
        this.articles = new Map();
    }

    async saveMany(articles) {
        for (const article of articles) {
            this.articles.delete(article.id); // re-insert so recently seen articles are evicted last
            this.articles.set(article.id, structuredClone(article));
        }
        while (this.articles.size > this.maxEntries) {
            this.articles.delete(this.articles.keys().next().value);
        }
    }

    async findById(id) {
        const article = this.articles.get(id);
        return article ? structuredClone(article) : null;
    }
}

module.exports = { InMemoryArticleRepository };
