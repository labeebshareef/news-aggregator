/** The only user fields that ever leave the service layer. The password hash never does. */
function toPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
        language: user.language,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

module.exports = { toPublicUser };
