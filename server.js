/**
 * UniBuddy Backend Server
 * 
 * Express server that provides the Google Drive file upload API.
 * Accepts PDF uploads from the UniBuddy frontend, stores them in
 * Google Drive, and saves the download link to Firebase RTDB.
 */

require("dotenv").config();

// Workaround for Node.js v24.17.0 keep-alive socket reuse regression in node-fetch/gaxios
const http = require("http");
const https = require("https");
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const uploadRoutes = require("./routes/upload");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = process.env.PORT || 5000;


// CORS — Allow requests from UniBuddy frontend origins
app.use(
  cors({
    origin: [
      "http://localhost:8001",       // Local Python dev server
      "http://localhost:5500",       // VS Code Live Server
      "http://127.0.0.1:8001",
      "http://127.0.0.1:5500",
      "https://unibuddy-72ef1.web.app",  // Firebase Hosting production
      "https://unibuddy-72ef1.firebaseapp.com",
      "https://unibuddylk.web.app",
      "https://unibuddylk.firebaseapp.com"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

// Parse JSON bodies (for non-file routes)
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "UniBuddy Backend — Google Drive Upload API",
    version: "1.0.0",
    endpoints: {
      upload: "POST /api/upload"
    }
  });
});

// Health check shorthand
app.get("/api/health", (req, res) => {
  const credentialsExist = fs.existsSync(
    path.join(__dirname, "config", "google-credentials.json")
  );
  const folderIdSet =
    process.env.GOOGLE_DRIVE_FOLDER_ID &&
    process.env.GOOGLE_DRIVE_FOLDER_ID !== "YOUR_FOLDER_ID_HERE";

  res.json({
    status: "ok",
    credentialsConfigured: credentialsExist,
    driveFolderConfigured: folderIdSet,
    firebaseUrl: process.env.FIREBASE_DB_URL ? "configured" : "not set"
  });
});

// Mount upload route
app.use("/api/upload", uploadRoutes);
app.use("/api/chat", chatRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({
    success: false,
    message: "Internal server error: " + err.message
  });
});

// Start server only when not running on Netlify serverless functions
if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  UniBuddy Backend — Google Drive Upload API      ║`);
    console.log(`║  Server running on http://localhost:${PORT}          ║`);
    console.log(`╚══════════════════════════════════════════════════╝\n`);

    // Configuration status checks
    const credentialsPath = path.join(__dirname, "config", "google-credentials.json");
    if (!fs.existsSync(credentialsPath)) {
      console.warn("⚠️  WARNING: config/google-credentials.json not found!");
      console.warn("   Place your Google Service Account JSON key there.\n");
    } else {
      console.log("✅ Google credentials file found.");
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId || folderId === "YOUR_FOLDER_ID_HERE") {
      console.warn("⚠️  WARNING: GOOGLE_DRIVE_FOLDER_ID not set in .env!");
      console.warn("   Set your target Google Drive folder ID.\n");
    } else {
      console.log(`✅ Google Drive folder ID: ${folderId}`);
    }

    if (process.env.FIREBASE_DB_URL) {
      console.log(`✅ Firebase DB URL: ${process.env.FIREBASE_DB_URL}`);
    } else {
      console.warn("⚠️  WARNING: FIREBASE_DB_URL not set in .env!\n");
    }

    console.log("");
  });
}

module.exports = app;
