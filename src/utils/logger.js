const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/** Minimal leveled logger writing one JSON line per entry, easy to ship to any log collector. */
function createLogger(level = 'info') {
    const threshold = level === 'silent' ? -1 : (LEVELS[level] ?? LEVELS.info);

    const log = (name) => (message, meta = {}) => {
        if (LEVELS[name] > threshold) return;
        const entry = { level: name, time: new Date().toISOString(), message, ...meta };
        const stream = name === 'error' || name === 'warn' ? process.stderr : process.stdout;
        stream.write(`${JSON.stringify(entry)}\n`);
    };

    return {
        error: log('error'),
        warn: log('warn'),
        info: log('info'),
        debug: log('debug'),
    };
}

module.exports = { createLogger };
