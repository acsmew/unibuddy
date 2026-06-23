const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Disable keepAlive globally to work around Node.js v24.17.0 keep-alive reuse regression
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

const CREDENTIALS_PATH = path.join(__dirname, 'config', 'google-credentials.json');

async function testAuth() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    console.log('Credentials loaded. client_email:', credentials.client_email);

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );

    console.log('Requesting access token...');
    const tokenInfo = await auth.getAccessToken();
    console.log('Access token retrieved successfully:', tokenInfo ? 'Yes' : 'No');
  } catch (err) {
    console.error('Auth test failed:', err);
  }
}

testAuth();
