const axios = require('axios');

const LOCAL_API = 'http://asl-website.test/migrate';

const LIVE_API = 'http://asl-website.test/cache-clear';

async function syncEmployees() {

    try {

        console.log('Fetching local employees...');

        // local software api
        const response = await axios.get(LOCAL_API);

        const employees = response.data;

        console.log('Sending to live server...');

        // send to live server
        const serverResponse = await axios.get(LIVE_API, {
            employees: employees
        }, {
            headers: {
                Authorization: 'Bearer YOUR_TOKEN'
            }
        });

        console.log('Success:', serverResponse.data);

    } catch (error) {

        console.log('Sync Failed');

        if (error.response) {
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
    }
}

// first run
syncEmployees();

// every 5 sec
setInterval(syncEmployees, 5000);