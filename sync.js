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

// const EMPLOYEE_SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes
const EMPLOYEE_SYNC_INTERVAL = 2000; // 2 minutes
let isEmployeeSyncing = false;

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

        console.log(`[${getTime()}] Data Sent to Server`, response.data);

        return response.data;

    } catch (error) {

        console.log(`[${getTime()}] Data Send Failed`);

        // Better debugging
        if (error.response) {
            console.log('Server Error:', error.response.status);
            console.log(error.response.data);
        } else if (error.request) {
            console.log('No Response From Server');
        } else {
            console.log(error.message);
        }

        return false;
    }
}

// fetch employee data from device
async function employeeDataFetchServer() {
    try {
        let url = SERVER_BASE_URL + '/zkteco/sync-employees?device_name=' + DEVICE_NAME+'&device_token=' + DEVICE_TOKEN;
        
        console.log(`[${getTime()}] Fetching employee data from device`);

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
            await sendEmployeeDataDevice(response.data);
            return response.data;
        }

        return false;

    } catch (error) {
        console.log(`[${getTime()}] Employee Data Fetch Failed`, error.message);
        return false;
    }
}

// send employee data to device
async function sendEmployeeDataDevice(data) {
    
    try {
        const areas = await syncDeviceAreas();

        console.log(`[${getTime()}] Device areas fetched: `, areas.data.length);

        if(!areas.data && areas.data.length == 0){
            return false;
        }

        return true;

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
        console.log(`[${getTime()}] Employee Data Send Failed`, error.message);
        
        return false;
    }
}

// sync employee data
async function syncEmployeeData() {
    // prevent overlapping sync
    if (isEmployeeSyncing) {
        console.log(`[${getTime()}] Previous employee sync still running...`);
        return;
    }

    isEmployeeSyncing = true;

    try {

        console.log(`\n[${getTime()}] Employee Sync Started`);

        // fetch employee data
        const employeeData = await employeeDataFetchServer();

        if (employeeData) {

            const employeeList = employeeData.data || [];

            console.log(`[${getTime()}] Employees Found: ${employeeList.length}`);

            if (employeeList.length > 0) {

                // send data to device
                const deviceResponse = await sendEmployeeDataDevice(employeeData);

                if (deviceResponse) {
                    console.log(`[${getTime()}] Employee data sent to device successfully`);
                } else {
                    console.log(`[${getTime()}] Failed to send employee data to device`);
                }
                
            } else {
                console.log(`[${getTime()}] Employee data found 0 records, skipping send to device`);
            }

        } else {
            console.log(`[${getTime()}] No employee data found`);

            const login = await loginDevice();

            if (login) {
                syncEmployeeData();
            }
        }

        console.log(`[${getTime()}] Employee Sync Completed`);

    } catch (error) {
        console.log(`[${getTime()}] Employee Sync Failed`, error.message);
    } finally {
        // always release lock
        isEmployeeSyncing = false;

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

        if (retry) {
            await loginDevice();
            const areasData = await syncDeviceAreas(false);
            return areasData.data || [];
        }

        return [];
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
async function startAttendanceSyncLoop() {
    try {
        await syncZktecoAttendenceData();
    } catch (error) {
        console.log('Attendance Loop Error:', error.message);
    } finally {
        setTimeout(startAttendanceSyncLoop, SYNC_INTERVAL);
    }
}

// Employee Sync Loop (every 2 minutes)
async function startEmployeeSyncLoop() {
    try {
        await employeeDataFetchServer();
    } catch (error) {
        console.log('Employee Loop Error:', error.message);
    } finally {
        setTimeout(startEmployeeSyncLoop, EMPLOYEE_SYNC_INTERVAL);
    }
}

startAttendanceSyncLoop();
startEmployeeSyncLoop();