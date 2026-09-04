// Bring Mongoose into the project
var mongoose = require( 'mongoose' );
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const AGENTS_API_URL = (process.env.AGENTS_API_URL || 'http://localhost:8001').replace(/\/$/, '');
const AGENTS_HEALTH_URL = `${AGENTS_API_URL}/health`;
const AGENTS_SUMMARIES_URL = `${AGENTS_API_URL}/api/summaries`;


/*********************/
/*******MONGODB*******/
/*********************/

// Create the database connection
mongoose.connect(process.env.MONGODB_URI_DEVELOPMENT + process.env.MONGODB_DATABASE);
mongoose.set('useFindAndModify', false);

// Catch connection event
mongoose.connection.on('connected', function () {
  //console.log('Mongoose connected to ' + "mongodb://wot_admin:cosas_acg21@10.0.7.3:27017/wot-directory");
  bootstrapSummaryCatalog().catch((error) => {
    console.error('Summary bootstrap failed:', error.message || error);
  });
});

// Catch connection error event
mongoose.connection.on('error',function (err) {
  console.log('Mongoose connection error: ' + err);
  process.exit(1);
});

// Catch disconnection event
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose disconnected');
});

// Catch end Node application event
process.on('SIGINT', function() {
  mongoose.connection.close(function () {
    console.log('Mongoose disconnected through app termination');
    process.exit(0);
  });
});


/**********************/
/********FUSEKI********/
/**********************/

checkFusekiConnection().then(result => {
  console.log(result);
}).catch(error => {
  console.error(error);
});

// Function to check Fuseki connection
async function checkFusekiConnection() {
  const fusekiEndpoint = process.env.FUSEKI_URI_DEVELOPMENT + '/sparql'; 

  try {
      // Send a simple SPARQL query to check the connection
      const response = await axios.get(fusekiEndpoint + '?query=ASK WHERE { ?s ?p ?o }');

      if (response.status === 200) {
          fusekiStartupActive = true;
          return { success: true, message: 'Fuseki process is online', status: 200 };
      } else {
          throw new Error('Fuseki connection failed');
      }
  } catch (error) {
      return { success: false, message: 'Fuseki connection failed', status: 500 };
  }
}

/*************************/
/********AI AGENTS********/
/*************************/

async function isAgentsServiceHealthy() {
  try {
    const response = await axios.get(AGENTS_HEALTH_URL, {
      timeout: 5000,
      headers: {
        Accept: 'application/json',
      },
    });

    return response.status === 200 && response.data && response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}



// Models
require('./thing_description');
require('./summary_catalog');


async function bootstrapSummaryCatalog() {
  const SummaryCatalog = mongoose.model('summary_catalog');

  const healthy = await isAgentsServiceHealthy();
  if (!healthy) {
    console.log('Agents service not healthy at startup; skipping summary catalog bootstrap.');
    return;
  }

  const existingCount = await SummaryCatalog.countDocuments({});
  if (existingCount > 0) {
    console.log('Summary catalog already exists; skipping startup generation.');
    return;
  }

  const response = await axios.get(AGENTS_SUMMARIES_URL, {
    headers: {
      Accept: 'application/json',
    },
  });

  const devices = response.data && Array.isArray(response.data.devices)
    ? response.data.devices
    : [];

  const now = new Date();
  const operations = devices
    .filter((device) => device && typeof device.id === 'string' && device.id.trim())
    .map((device) => ({
      updateOne: {
        filter: {
          deviceId: device.id.trim(),
        },
        update: {
          $set: {
            deviceId: device.id.trim(),
            name: typeof device.name === 'string' ? device.name : '',
            summary: typeof device.summary === 'string' ? device.summary : '',
            properties: Array.isArray(device.properties) ? device.properties : [],
            actions: Array.isArray(device.actions) ? device.actions : [],
            events: Array.isArray(device.events) ? device.events : [],
            generatedAt: now
          },
        },
        upsert: true,
      },
    }));

  if (operations.length === 0) {
    console.log('Summary catalog bootstrap completed. No valid devices returned by agents service.');
    return;
  }

  await SummaryCatalog.bulkWrite(operations, { ordered: false });
  console.log(`Summary catalog bootstrap completed. Device documents upserted: ${operations.length}.`);
}