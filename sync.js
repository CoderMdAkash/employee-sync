const axios = require('axios');
const { loadStoredToken, saveToken, clearStoredToken } = require('./tokenStore');
const { loadLastAttendanceTime, saveLastAttendanceTime } = require('./attendanceCache');

const DEVICE_BASE_URL = 'http://localhost:8088';
const SERVER_BASE_URL = 'http://rahat-hostel-management.test';
const SERVER_AUTH_TOKEN = 'your_server_auth_token_here';
const DEVICE_AUTH_USERNAME = 'admin';
const DEVICE_AUTH_PASSWORD = 'Rasidul.90';

const SYNC_INTERVAL = 5000;
let isSyncing = false;
let DEVICE_TOKEN = loadStoredToken();
let LAST_ATTENDANCE_TIME = loadLastAttendanceTime();

async function syncZktecoAttendenceData() {

    // prevent overlapping sync
    if (isSyncing) {
        console.log(`[${getTime()}] Previous sync still running...`);
        return;
    }

    isSyncing = true;

    try {

        console.log(`\n[${getTime()}] Device Sync Started`);

        // fetch attendance data
        const attendanceData = await attendanceDataFetch();

        if (attendanceData) {

            const attendanceList = attendanceData.data;

            console.log(`[${getTime()}] Attendance Found:` + attendanceList.length);

            if (attendanceList.length > 0) {

                // send data to server
                const serverResponse = await sendDataServer(attendanceData);

                if (serverResponse) {
                    console.log(`[${getTime()}] Data sent to server successfully`);

                    updateLastAttendanceTime(attendanceData);

                } else {
                    console.log(`[${getTime()}] Failed to send data to server`);
                }
                
            }else {
                console.log(`[${getTime()}] attendance data found 0 records, skipping send to server`);
            }

        } else {
            console.log(`[${getTime()}] No attendance data found`);

            const login = await loginDevice();

            if (login) {
                syncZktecoAttendenceData();
            }
        }

        console.log(`[${getTime()}] Device Sync Completed`);

    } catch (error) {
        console.log(`[${getTime()}] Device Sync Failed`);
    } finally {
        // always release lock
        isSyncing = false;

    }
}


async function attendanceDataFetch(retry = true) {
    if (!DEVICE_TOKEN) {
        const loggedIn = await loginDevice();
        if (!loggedIn) {
            return false;
        }
    }

    try {
        let url = DEVICE_BASE_URL + '/iclock/api/transactions/';
        if (LAST_ATTENDANCE_TIME) {
            url += `?start_time=${encodeURIComponent(LAST_ATTENDANCE_TIME)}`;
            console.log(`[${getTime()}] Fetching attendance since ${LAST_ATTENDANCE_TIME}`);
        }

        const response = await axios.get(
            url,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Token ' + DEVICE_TOKEN
                },
                timeout: 5000
            }
        );

        return response.data;

    } catch (error) {
        const isUnauthorized = error.response && error.response.status === 401;
        if (isUnauthorized && retry) {
            console.log(`[${getTime()}] Token invalid or expired, re-authenticating...`);
            DEVICE_TOKEN = '';
            clearStoredToken();
            const loggedIn = await loginDevice();
            if (loggedIn) {
                return attendanceDataFetch(false);
            }
        }

        console.log(`[${getTime()}] Transaction Fetch Failed`, error.message);
        return false;
    }
}

async function loginDevice() {
    try {
        const res = await axios.post(
            DEVICE_BASE_URL + '/api-token-auth/',
            {
                username: DEVICE_AUTH_USERNAME,
                password: DEVICE_AUTH_PASSWORD
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );

        console.log('Login Success', res.data.token);

        saveToken(res.data.token);
        DEVICE_TOKEN = res.data.token;

        return true;

    } catch (err) {
        console.log('Login failed:', err.message);
        return false;
    }
}


// send data to server
async function sendDataServer(data) {
    try {
        const response = await axios.get(
            SERVER_BASE_URL + '/iclock/ping',
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Token ' + SERVER_AUTH_TOKEN
                },
                timeout: 5000
            }
        );

        return response.data;
    } catch (error) {
        console.log(`[${getTime()}] Data Send Failed`);
        return false;
    }
}

function updateLastAttendanceTime(attendanceData) {
    const attendanceList = Array.isArray(attendanceData.data) ? attendanceData.data : [];
    const latestTime = attendanceList.reduce((latest, item) => {
        const timeFields = ['timestamp', 'time', 'check_time', 'punch_time', 'datetime', 'date', 'created_at', 'updated_at'];
        for (const field of timeFields) {
            if (item[field]) {
                const value = item[field];
                const currentDate = latest ? new Date(latest) : null;
                const nextDate = new Date(value);
                if (!latest || nextDate > currentDate) {
                    return value;
                }
                break;
            }
        }
        return latest;
    }, '');

    if (latestTime) {
        LAST_ATTENDANCE_TIME = latestTime;
        saveLastAttendanceTime(latestTime);
        console.log(`[${getTime()}] Updated last attendance time from device: ${latestTime}`);
    }
}

// Helper: Time Format
function getTime() {
    return new Date().toLocaleString();
}

// Infinite Sync Loop
async function startSyncLoop() {
    try {
        await syncZktecoAttendenceData();
    } catch (error) {
        console.log('Loop Error:', error.message);
    } finally {
        setTimeout(startSyncLoop, SYNC_INTERVAL);
    }
}

startSyncLoop();