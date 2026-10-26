const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { validateArticleParams, validateSearchParams } = require('../validators/news.validators');

function createNewsRouter({ controller, authenticate }) {
    const router = express.Router();

    // Every news route is personalised, so authentication applies to the whole router.
    router.use(authenticate);

    router.get('/', asyncHandler(controller.getNews));
    router.get('/read', asyncHandler(controller.getRead));
    router.get('/favorites', asyncHandler(controller.getFavorites));
    router.get('/search/:keyword', validate(validateSearchParams, 'params'), asyncHandler(controller.search));

    router.post('/:id/read', validate(validateArticleParams, 'params'), asyncHandler(controller.markRead));
    router.post('/:id/favorite', validate(validateArticleParams, 'params'), asyncHandler(controller.markFavorite));
    router.delete('/:id/favorite', validate(validateArticleParams, 'params'), asyncHandler(controller.removeFavorite));

    return router;
}

module.exports = { createNewsRouter };
