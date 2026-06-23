/**
 * Google OAuth2 Refresh Token Generator
 * 
 * Automatically starts a local server to handle Google's OAuth2 redirection callback,
 * opens the login screen in your default browser, retrieves the refresh token, and
 * saves it directly into your .env file.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { google } = require('googleapis');

// Disable keepAlive globally to work around Node v24.17.0 keep-alive issue
http.globalAgent.keepAlive = false;
https = require('https');
https.globalAgent.keepAlive = false;

const envPath = path.join(__dirname, '.env');

// Read existing .env config
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

function getEnvValue(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

// Ask user to enter client ID and client secret if not already set in .env
const clientId = getEnvValue('GOOGLE_CLIENT_ID');
const clientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');

if (!clientId || !clientSecret) {
  console.log('\n==================================================================');
  console.log('🔑 Google OAuth2 Setup Utility');
  console.log('==================================================================');
  console.log('Before running this script, you must obtain a Client ID and Client Secret:');
  console.log('1. Go to Google Cloud Console (https://console.cloud.google.com)');
  console.log('2. In Credentials page, click "+ CREATE CREDENTIALS" -> "OAuth client ID"');
  console.log('3. Application type: Web application');
  console.log('4. Authorized redirect URIs: Add "http://localhost:5000/oauth2callback"');
  console.log('5. Copy the Client ID and Client Secret, paste them into your .env file:');
  console.log('   GOOGLE_CLIENT_ID=your-client-id');
  console.log('   GOOGLE_CLIENT_SECRET=your-client-secret');
  console.log('6. Then run this script again.\n');
  process.exit(1);
}

const PORT = 5000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

// Generate authorization URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Requests a refresh token
  prompt: 'consent',     // Forces consent screen to ensure refresh token is always returned
  scope: ['https://www.googleapis.com/auth/drive']
});

// Start local HTTP server to receive redirect callback
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`);
    const code = urlParams.searchParams.get('code');
    const err = urlParams.searchParams.get('error');

    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>❌ Authorization failed: ${err}</h3>`);
      console.error('\n❌ Authorization failed:', err);
      server.close();
      process.exit(1);
    }

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 10%;">
          <h2 style="color: #0f9d58;">✅ Authorization Successful!</h2>
          <p>You can close this tab and return to your terminal.</p>
        </div>
      `);
      
      console.log('\n📥 Received authorization code. Exchanging for tokens...');

      try {
        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
          console.warn('\n⚠️ WARNING: No refresh token returned. If you have authorized this app before, Google may not return a refresh token unless you revoke access first or clear your credentials.');
          console.log('Tokens received:', Object.keys(tokens));
        } else {
          console.log('\n✅ Refresh Token retrieved successfully!');
          console.log(`🔑 Refresh Token: ${refreshToken}`);

          // Update .env file with the refresh token
          let updatedEnv = envContent;
          if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            updatedEnv = envContent.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
          } else {
            updatedEnv += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
          }
          
          fs.writeFileSync(envPath, updatedEnv, 'utf8');
          console.log('\n💾 Saved GOOGLE_REFRESH_TOKEN to .env file.');
        }

        server.close(() => {
          console.log('\n🏁 Script completed successfully. Start your backend server using start.bat!');
          process.exit(0);
        });
      } catch (tokenErr) {
        console.error('\n❌ Error exchanging authorization code:', tokenErr.message);
        res.end(`<h3>❌ Error exchanging authorization code: ${tokenErr.message}</h3>`);
        server.close();
        process.exit(1);
      }
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('\n==================================================================');
  console.log('🔗 Google OAuth2 Redirection Server Listening...');
  console.log('==================================================================');
  console.log(`Port: ${PORT}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log('\nOpening your browser to authorize UniBuddy Drive Access...');
  console.log(`URL: ${authUrl}\n`);

  // Open the browser
  const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${startCmd} "${authUrl.replace(/&/g, '^&')}"`);
});
