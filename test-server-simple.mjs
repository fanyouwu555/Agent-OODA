// test-server-simple.mjs
import http from 'http';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    console.log(`Testing ${path}...`);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTests() {
  try {
    // Test 1: Root path
    console.log('\n=== Test 1: Root path ===');
    const result1 = await makeRequest('/');
    console.log(`Status: ${result1.statusCode}`);
    console.log(`Response: ${result1.data.substring(0, 200)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  try {
    // Test 2: Health check
    console.log('\n=== Test 2: Health check ===');
    const result2 = await makeRequest('/health');
    console.log(`Status: ${result2.statusCode}`);
    console.log(`Response: ${result2.data}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  try {
    // Test 3: Skills list
    console.log('\n=== Test 3: Skills list ===');
    const result3 = await makeRequest('/api/skills');
    console.log(`Status: ${result3.statusCode}`);
    console.log(`Response: ${result3.data.substring(0, 200)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

runTests();
