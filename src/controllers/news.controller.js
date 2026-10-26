// Tells clients (and anyone debugging with curl -i) where the articles came from.
const CACHE_HEADER = { cache: 'HIT', origin: 'MISS', stale: 'STALE' };

const LIST_LABELS = { read: 'read', favorites: 'favorite' };

function createNewsController({ newsService }) {
    const addTo = (list) => async (req, res) => {
        const { article, added } = await newsService.addToList(req.user.id, list, req.validated.id);
        res.status(200).json({
            message: added ? `Article marked as ${LIST_LABELS[list]}` : `Article was already marked as ${LIST_LABELS[list]}`,
            article,
        });
    };

    const getList = (list) => async (req, res) => {
        const news = await newsService.getList(req.user.id, list);
        res.status(200).json({ count: news.length, news });
    };

    const sendArticles = (res, { articles, source, notice }, extra = {}) => {
        res.set('X-Cache', CACHE_HEADER[source]);
        res.status(200).json({ ...extra, count: articles.length, news: articles, ...(notice && { notice }) });
    };

    return {
        async getNews(req, res) {
            sendArticles(res, await newsService.getNewsForUser(req.user));
        },

        async search(req, res) {
            const { keyword } = req.validated;
            sendArticles(res, await newsService.searchForUser(req.user, keyword), { keyword });
        },

        markRead: addTo('read'),
        markFavorite: addTo('favorites'),
        getRead: getList('read'),
        getFavorites: getList('favorites'),

        async removeFavorite(req, res) {
            await newsService.removeFromList(req.user.id, 'favorites', req.validated.id);
            res.status(204).end();
        },
    };
}

module.exports = { createNewsController };
