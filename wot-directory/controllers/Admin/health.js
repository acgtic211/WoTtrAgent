const axios = require('axios');

module.exports.checkServiceHealth = async function checkServiceHealth(serviceUrl, expectedKey = 'status', expectedValue = 'ok') {
  const normalizedUrl = String(serviceUrl || '').replace(/\/$/, '');

  if (!normalizedUrl) {
    return {
      ok: false,
      message: 'Service URL is not configured',
    };
  }

  try {
    const response = await axios.get(`${normalizedUrl}/health`, {
      timeout: 5000,
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status !== 200) {
      return {
        ok: false,
        message: `Health check failed with status ${response.status}`,
      };
    }

    const payload = response.data || {};
    if (payload[expectedKey] !== expectedValue) {
      return {
        ok: false,
        message: `Health check did not return ${expectedKey}=${expectedValue}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: 'Service is not reachable or not healthy',
      error,
    };
  }
};


// Function to check Fuseki connection
module.exports.isFusekiServiceActive =async function checkFusekiConnectionBool() {
  const fusekiEndpoint = process.env.FUSEKI_URI_DEVELOPMENT + '/sparql'; 

  try {
      // Send a simple SPARQL query to check the connection
      const response = await axios.get(fusekiEndpoint + '?query=ASK WHERE { ?s ?p ?o }');

      if (response.status === 200) {
          return true;
      } else {
         return false;
      }
  } catch (error) {
      return false;
  }
}