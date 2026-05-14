const fs = require('fs');
const path = require('path');

const TOKEN_STORE_PATH = path.join(__dirname, 'device-token.json');
const TOKEN_TTL_MS = 30 * 60 * 1000; // optional expiry window

function loadStoredToken() {
    try {
        if (!fs.existsSync(TOKEN_STORE_PATH)) {
            return '';
        }

        const raw = fs.readFileSync(TOKEN_STORE_PATH, 'utf8');
        const store = JSON.parse(raw);
        if (!store || !store.token) {
            return '';
        }

        if (store.updatedAt && Date.now() - store.updatedAt > TOKEN_TTL_MS) {
            console.log('[TokenStore] Stored device token expired, re-authenticating.');
            return '';
        }

        console.log('[TokenStore] Loaded stored device token.');
        return store.token;
    } catch (error) {
        console.log('[TokenStore] Failed to load stored token:', error.message);
        return '';
    }
}

function saveToken(token) {
    try {
        const store = {
            token,
            updatedAt: Date.now()
        };
        fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
        console.log('[TokenStore] Device token saved.');
    } catch (error) {
        console.log('[TokenStore] Failed to save token:', error.message);
    }
}

function clearStoredToken() {
    try {
        if (fs.existsSync(TOKEN_STORE_PATH)) {
            fs.unlinkSync(TOKEN_STORE_PATH);
            console.log('[TokenStore] Cleared stored token.');
        }
    } catch (error) {
        console.log('[TokenStore] Failed to clear stored token:', error.message);
    }
}

module.exports = {
    loadStoredToken,
    saveToken,
    clearStoredToken
};
