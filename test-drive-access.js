const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

const CREDENTIALS_PATH = path.join(__dirname, 'config', 'google-credentials.json');
const FOLDER_ID = '1q1yZiSRxJtJDcSZ1X9vP2qwv3IrFVmGB';

async function testAccess() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });
    
    console.log(`Checking folder metadata for ID: ${FOLDER_ID}...`);
    const response = await drive.files.get({
      fileId: FOLDER_ID,
      fields: 'id, name, owners, capabilities'
    });
    console.log('Folder info retrieved successfully:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Failed to get folder metadata. Error message:', err.message);
    if (err.errors) {
      console.error('Detailed errors:', JSON.stringify(err.errors, null, 2));
    }
  }
}

testAccess();
