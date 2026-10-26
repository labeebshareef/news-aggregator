/** HTTP layer for /users: translate requests into service calls and results into responses. Nothing else. */
function createUsersController({ authService, preferencesService }) {
    return {
        async signup(req, res) {
            const user = await authService.register(req.validated);
            res.status(200).json({ message: 'User registered successfully', user });
        },

        async login(req, res) {
            const session = await authService.login(req.validated);
            res.status(200).json(session);
        },

        async getPreferences(req, res) {
            const result = await preferencesService.get(req.user.id);
            res.status(200).json(result);
        },

        async updatePreferences(req, res) {
            const result = await preferencesService.update(req.user.id, req.validated);
            res.status(200).json({ message: 'Preferences updated', ...result });
        },
    };
}

module.exports = { createUsersController };
