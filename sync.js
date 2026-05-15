const axios = require('axios');
const { loadStoredToken, saveToken, clearStoredToken } = require('./tokenStore');
const { loadLastAttendanceTime, saveLastAttendanceTime } = require('./attendanceCache');

const DEVICE_BASE_URL = 'http://localhost:8088';
const SERVER_BASE_URL = 'http://localhost:8000';
const SERVER_AUTH_TOKEN = 'C8ETIujeBGeRv2DSlrfMjXHD7OVXG';
const DEVICE_AUTH_USERNAME = 'admin';
const DEVICE_AUTH_PASSWORD = 'Rasidul.90';
const DEVICE_NAME = 'DEVICE_001';

const SYNC_INTERVAL = 5000;
let isSyncing = false;
let DEVICE_TOKEN = loadStoredToken();
let LAST_ATTENDANCE_TIME = loadLastAttendanceTime();

const EMPLOYEE_SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes
// const EMPLOYEE_SYNC_INTERVAL = 4000;
let isEmployeeSyncing = false;


// ==================================================================
// sync attendance data device to server start
// ==================================================================

async function syncZktecoAttendenceDataToServer() {

    // prevent overlapping sync
    if (isSyncing) {
        console.log(`[${getTime()}] Sync skipped: previous sync still running`);
        return;
    }

    isSyncing = true;

    console.log(`\n[${getTime()}] ==============================`);
    console.log(`[${getTime()}] Device Sync Started`);

    try {
        // fetch attendance
        const attendanceData = await attendanceDataFetchFromDevice();

        console.log(`[${getTime()}] Attendance Found:` + attendanceData.data.length);

        if (attendanceData && attendanceData.data && attendanceData.data.length > 0) {

            // send data to server
            const serverResponse = await sendEmployeeAttendanceDataServer(attendanceData);

            if (serverResponse) {
                console.log(`[${getTime()}] Data sent to server successfully`);

                await updateLastAttendanceTime(attendanceData);

            } else {
                console.log(`[${getTime()}] Failed to send data to server`);
            }
                
        } else {
            console.log(`[${getTime()}] No new attendance data found on device`);
        }

        return;

    } catch (error) {
        console.log(`[${getTime()}] Device Sync Failed`);
    } finally {
        console.log(`[${getTime()}] Device Sync Completed`);
        console.log(`[${getTime()}] ==============================\n`);

        isSyncing = false;

    }
}


async function attendanceDataFetchFromDevice(retry = true) {
    
    try {
        // if not logged in, try to login first
        if (!DEVICE_TOKEN) {
            const loggedIn = await loginDevice();
            if (!loggedIn) {
                return false;
            }
        }

        // attendance data fetch from device with optional last attendance time filter
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
                return attendanceDataFetchFromDevice(false);
            }
        }

        console.log(`[${getTime()}] Transaction Fetch Failed`, error.message);
        return false;
    }
}


// send data to server
async function sendEmployeeAttendanceDataServer(data) {
    try {

        const params = new URLSearchParams({
            device_name: DEVICE_NAME,
            device_token: SERVER_AUTH_TOKEN
        });

        const response = await axios.post(
            `${SERVER_BASE_URL}/api/zkteco/attendance-records?${params.toString()}`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000
            }
        );

        return response.data;

    } catch (error) {
        console.log(`[${getTime()}] Attendance Data Send to server Failed`, error.message);

        return false;
    }
}


// ==================================================================
// sync attendance data device to server end
// ==================================================================


// ==================================================================
// sync new employee data server to device start
// ==================================================================

async function syncEmployeeDataFromServer() {

    // prevent overlapping sync
    if (isEmployeeSyncing) {
        console.log(`[${getTime()}] Previous employee sync from server is still running...`);
        return;
    }

    isEmployeeSyncing = true;

    try {

        console.log(`\n[${getTime()}] ==============================`);
        console.log(`[${getTime()}] Employee Sync Started`);

        // fetch employee data
        const employeeData = await newEmployeeDataFetchServer();

        console.log(`[${getTime()}] Employee Data Found: ${employeeData && employeeData.data ? employeeData.data.length : 0}`);

        if (employeeData && employeeData.data && employeeData.data.length > 0) {

            // send data to device
            const deviceResponse = await sendEmployeeDataDevice(employeeData);
            const statusUpdate = await employeeStatusUpdateServer(employeeData);

            return deviceResponse.data;

        } else {
            console.log(`[${getTime()}] No employee data found`);
        }

    } catch (error) {
        console.log(`[${getTime()}] Employee Sync Failed`, error.message);
    } finally {
        console.log(`[${getTime()}] Employee data sent to device successfully`);

        // always release lock
        isEmployeeSyncing = false;
    }
}

// fetch employee data from device
async function newEmployeeDataFetchServer() {
    try {
        let url = SERVER_BASE_URL + '/api/zkteco/device-employees?device_name=' + DEVICE_NAME+'&device_token=' + SERVER_AUTH_TOKEN;
        
        const response = await axios.get(
            url,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000
            }
        );

        if(response.data){
            return response.data;
        }else{
            return false;
        }

    } catch (error) {
        console.log(`[${getTime()}] Employee Data Fetch Failed`, error.message);
        return false;
    }
}

// send employee data to device
async function sendEmployeeDataDevice(data, retry = true) {
    
    try {
        const areas = await syncDeviceAreas();

        console.log(`[${getTime()}] Device areas fetched: `, areas.data.length);

        if(!areas.data && areas.data.length == 0){
            return false;
        }

        const response = await axios.post(
            SERVER_BASE_URL + '/personnel/api/employees/',
            data,
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

        console.log(`[${getTime()}] Employee Data Send to device Failed`, error.message);

        const isUnauthorized = error.response && error.response.status === 401;
        if (isUnauthorized && retry) {
            console.log(`[${getTime()}] Token invalid or expired, re-authenticating...`);

            DEVICE_TOKEN = '';
            clearStoredToken();
            const loggedIn = await loginDevice();

            if (loggedIn) {
                return sendEmployeeDataDevice(data, false);
            }
        }
        
        return false;
    }
}

async function employeeStatusUpdateServer(data) {
    try {

        const statusUpdate = await axios.post(
            SERVER_BASE_URL + '/api/zkteco/update-employee-sync-status?id=' + data,
            { device_name: DEVICE_NAME, device_token: SERVER_AUTH_TOKEN },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000
            }
        );

        return statusUpdate.data;

    } catch (error) {
        console.log(`[${getTime()}] Employee Sync Status Update Failed`, error.message);
        return false;
    }
}

async function syncDeviceAreas(retry = true) {
    try {
        const response = await axios.get(
            DEVICE_BASE_URL + '/personnel/api/areas/',
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Token ' + DEVICE_TOKEN
                },
                timeout: 5000
            }
        );

        return response.data || [];
    } catch (error) {
        console.log(`[${getTime()}] Employee Data Fetch Failed`, error.message);

        const isUnauthorized = error.response && error.response.status === 401;
        if (isUnauthorized && retry) {
            console.log(`[${getTime()}] Token invalid or expired, re-authenticating...`);

            DEVICE_TOKEN = '';
            clearStoredToken();
            const loggedIn = await loginDevice();

            if (loggedIn) {
                return syncDeviceAreas(false);
            }
        }

        return [];
    }
}


// ==================================================================
// sync employee data server to device end
// ==================================================================


/// Helper: Login to device and get token

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


/// Helpers:

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

// =================================================================
// loop to sync data start
// =================================================================

// Infinite Sync Loop
async function startAttendanceSyncLoop() {
    try {
        await syncZktecoAttendenceDataToServer();
    } catch (error) {
        console.log('Attendance Loop Error:', error.message);
    } finally {
        setTimeout(startAttendanceSyncLoop, SYNC_INTERVAL);
    }
}

// Employee Sync Loop (every 2 minutes)
async function startEmployeeSyncLoop() {
    try {
        await syncEmployeeDataFromServer();
    } catch (error) {
        console.log('Employee Loop Error:', error.message);
    } finally {
        setTimeout(startEmployeeSyncLoop, EMPLOYEE_SYNC_INTERVAL);
    }
}

startAttendanceSyncLoop();
startEmployeeSyncLoop();

// =================================================================
// loop to sync data end
// =================================================================