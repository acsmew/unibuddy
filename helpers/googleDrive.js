/**
 * Google Drive Helper Module
 * 
 * Handles authentication via Service Account, file uploads to Google Drive,
 * public permission setting, and direct download link generation.
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// Workaround for Node.js v24.17.0 keep-alive socket reuse regression in node-fetch/gaxios
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

// Path to the Service Account credentials JSON
const CREDENTIALS_PATH = path.join(__dirname, "..", "config", "google-credentials.json");

/**
 * Creates an authenticated Google Auth client.
 * Prioritizes OAuth2 Refresh Token (for personal Gmail accounts to avoid quota issues).
 * Falls back to Service Account JWT if refresh token is not configured.
 * 
 * @returns {google.auth.OAuth2|google.auth.JWT} Authenticated Google auth client
 */
function getAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    console.log("[Google Auth] Using OAuth2 Refresh Token authentication.");
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "http://localhost:5000/oauth2callback"
    );
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    return oauth2Client;
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `No authentication configured. Please set GOOGLE_REFRESH_TOKEN in .env or place your Service Account JSON key at config/google-credentials.json`
    );
  }

  console.log("[Google Auth] Using Service Account JWT authentication.");
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/drive"]
  );

  return auth;
}

/**
 * Uploads a file to the specified Google Drive folder.
 * 
 * @param {string} filePath - Absolute path to the local temp file (from multer)
 * @param {string} fileName - Original filename to use on Google Drive
 * @param {string} mimeType - MIME type of the file (e.g., 'application/pdf')
 * @param {string} folderId - Google Drive folder ID to upload into
 * @returns {Promise<{fileId: string, webViewLink: string}>} Upload result
 */
async function uploadFileToDrive(filePath, fileName, mimeType, folderId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath)
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id, webViewLink, webContentLink"
  });

  console.log(`[Google Drive] File uploaded successfully. ID: ${response.data.id}`);

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink || ""
  };
}

/**
 * Sets public read permission on a Google Drive file.
 * Permission: role='reader', type='anyone'
 * This allows anyone with the link to download the file.
 * 
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<void>}
 */
async function setPublicPermission(fileId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: "reader",
      type: "anyone"
    }
  });

  console.log(`[Google Drive] Public read permission set for file: ${fileId}`);
}

/**
 * Converts a Google Drive file ID into a direct download link.
 * 
 * The webViewLink from Google Drive opens in the Drive viewer.
 * This function generates a link that triggers a direct file download instead.
 * 
 * Format: https://drive.google.com/uc?export=download&id=FILE_ID
 * 
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Direct download URL
 */
function getDirectDownloadLink(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Deletes the temporary local file created by multer after upload.
 * 
 * @param {string} filePath - Path to the temp file
 */
function deleteLocalTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Cleanup] Deleted temp file: ${filePath}`);
    }
  } catch (err) {
    console.error(`[Cleanup] Failed to delete temp file: ${filePath}`, err.message);
  }
}

module.exports = {
  getAuthClient,
  uploadFileToDrive,
  setPublicPermission,
  getDirectDownloadLink,
  deleteLocalTempFile
};
