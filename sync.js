const axios = require('axios');

const DEVICE_BASE_URL = 'http://localhost:8088';
const SERVER_BASE_URL = 'http://rahat-hostel-management.test';
const SERVER_AUTH_TOKEN = 'your_server_auth_token_here';
const DEVICE_AUTH_USERNAME = 'admin';
const DEVICE_AUTH_PASSWORD = 'Rasidul.90';

const SYNC_INTERVAL = 5000;
let isSyncing = false;
let DEVICE_TOKEN = '';

async function syncZktecoAttendenceData() {

    // prevent overlapping sync
    if (isSyncing) {
        console.log(`[${getTime()}] Previous sync still running...`);
        return;
    }

    isSyncing = true;

    try {

        console.log(`\n[${getTime()}] Device Sync Started `+DEVICE_TOKEN);

        // fetch attendance data
        const attendanceData = await attendanceDataFetch();

        if (attendanceData) {

            console.log(`[${getTime()}] Attendance Found:`, attendanceData);

            // send data to server
            const serverResponse = await sendDataServer(attendanceData);
            if (serverResponse) {
                console.log(`[${getTime()}] Data sent to server successfully`);
            } else {
                console.log(`[${getTime()}] Failed to send data to server`);
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
    try {

        const response = await axios.get(
            DEVICE_BASE_URL + '/iclock/api/transactions/',
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
        console.log(`[${getTime()}] Transaction Fetch Failed`);
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