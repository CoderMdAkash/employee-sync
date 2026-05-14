const fs = require('fs');
const path = require('path');

const CACHE_FILE_PATH = path.join(__dirname, 'attendance-cache.json');

function loadLastAttendanceTime() {
    try {
        if (!fs.existsSync(CACHE_FILE_PATH)) {
            return '';
        }

        const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
        const store = JSON.parse(raw);
        if (!store || !store.lastAttendanceTime) {
            return '';
        }

        console.log('[AttendanceCache] Loaded last attendance time:', store.lastAttendanceTime);
        return store.lastAttendanceTime;
    } catch (error) {
        console.log('[AttendanceCache] Failed to load cache:', error.message);
        return '';
    }
}

function saveLastAttendanceTime(lastAttendanceTime) {
    try {
        const store = {
            lastAttendanceTime,
            updatedAt: Date.now()
        };
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
        console.log('[AttendanceCache] Saved last attendance time:', lastAttendanceTime);
    } catch (error) {
        console.log('[AttendanceCache] Failed to save cache:', error.message);
    }
}

module.exports = {
    loadLastAttendanceTime,
    saveLastAttendanceTime
};
