/**
 * Upload Controller
 * 
 * Handles the file upload workflow:
 * 1. Receives multipart form data (PDF file + note metadata)
 * 2. Uploads the file to Google Drive
 * 3. Sets public read permission
 * 4. Generates direct download link
 * 5. Saves the note record to Firebase Realtime Database
 * 6. Cleans up temp file
 */

const {
  uploadFileToDrive,
  setPublicPermission,
  getDirectDownloadLink,
  deleteLocalTempFile
} = require("../helpers/googleDrive");

/**
 * Saves a note record to Firebase Realtime Database.
 * Updates the 'notes' array by fetching existing notes, prepending the new one,
 * and writing back the full array.
 * 
 * @param {object} noteData - The note record to save
 * @param {string} firebaseUrl - Firebase RTDB base URL
 * @returns {Promise<boolean>} Success status
 */
async function saveNoteToFirebase(noteData, firebaseUrl) {
  if (!firebaseUrl) {
    console.warn("[Firebase] No Firebase URL configured. Skipping cloud save.");
    return false;
  }

  // Ensure trailing slash
  const baseUrl = firebaseUrl.endsWith("/") ? firebaseUrl : firebaseUrl + "/";

  try {
    // Fetch existing notes from Firebase
    const response = await fetch(`${baseUrl}unibuddy/notes.json`, {
      cache: "no-store"
    });
    let existingNotes = [];
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        existingNotes = data;
      }
    }

    // Prepend the new note at the beginning
    existingNotes.unshift(noteData);

    // Write back the full notes array
    const putResponse = await fetch(`${baseUrl}unibuddy/notes.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existingNotes)
    });

    if (putResponse.ok) {
      console.log(`[Firebase] Note "${noteData.title}" saved successfully.`);
      return true;
    } else {
      console.error(`[Firebase] Failed to save note. Status: ${putResponse.status}`);
      return false;
    }
  } catch (err) {
    console.error("[Firebase] Error saving note:", err.message);
    return false;
  }
}

/**
 * Updates user points in Firebase Realtime Database.
 * 
 * @param {string} userEmail - Email of the user to reward
 * @param {number} points - Points to add
 * @param {string} firebaseUrl - Firebase RTDB base URL
 */
async function updateUserPointsInFirebase(userEmail, points, firebaseUrl) {
  if (!firebaseUrl) return;

  const baseUrl = firebaseUrl.endsWith("/") ? firebaseUrl : firebaseUrl + "/";

  try {
    const response = await fetch(`${baseUrl}unibuddy/users.json`, {
      cache: "no-store"
    });
    if (!response.ok) return;

    let users = await response.json();
    if (!Array.isArray(users)) return;

    const userIndex = users.findIndex(
      (u) => u.email.toLowerCase() === userEmail.toLowerCase()
    );
    if (userIndex !== -1) {
      users[userIndex].points = (users[userIndex].points || 0) + points;

      await fetch(`${baseUrl}unibuddy/users.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(users)
      });

      console.log(`[Firebase] Awarded ${points} points to ${userEmail}`);
    }
  } catch (err) {
    console.error("[Firebase] Error updating user points:", err.message);
  }
}

/**
 * Main upload handler — called by the Express route.
 * 
 * Expected form fields:
 * - pdfFile (file): The PDF document
 * - title, subject, description, faculty, year, batch, tags, noteStyle (text fields)
 * - uploaderEmail, uploaderName (text fields): Current user info from frontend
 */
async function handleUpload(req, res) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No PDF file was uploaded. Please select a file."
    });
  }

  // Extract metadata from form fields
  const {
    title,
    subject,
    description,
    faculty,
    year,
    batch,
    tags,
    noteStyle,
    noteType,
    uploaderEmail,
    uploaderName
  } = req.body;

  // Validate required fields
  if (!title || !subject || !uploaderEmail) {
    deleteLocalTempFile(file.path);
    return res.status(400).json({
      success: false,
      message: "Missing required fields: title, subject, uploaderEmail"
    });
  }

  const allowedNoteTypes = ["full", "short", "mindmap"];
  const validatedNoteType = allowedNoteTypes.includes(noteType) ? noteType : "full";

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId || folderId === "YOUR_FOLDER_ID_HERE") {
    deleteLocalTempFile(file.path);
    return res.status(500).json({
      success: false,
      message: "Server configuration error: GOOGLE_DRIVE_FOLDER_ID is not set in .env"
    });
  }

  try {
    console.log(`\n[Upload] Processing: "${title}" by ${uploaderName} (${uploaderEmail})`);
    console.log(`[Upload] File: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Step 1: Upload to Google Drive
    console.log("[Upload] Step 1/3: Uploading to Google Drive...");
    const { fileId } = await uploadFileToDrive(
      file.path,
      `${title.replace(/[^a-zA-Z0-9\s]/g, "_")}_${Date.now()}.pdf`,
      file.mimetype || "application/pdf",
      folderId
    );

    // Step 2: Set public read permission
    console.log("[Upload] Step 2/3: Setting public permissions...");
    await setPublicPermission(fileId);

    // Step 3: Generate direct download link
    const directDownloadUrl = getDirectDownloadLink(fileId);
    console.log(`[Upload] Step 3/3: Direct download link: ${directDownloadUrl}`);

    // Build the note record (matching the UniBuddy frontend note schema)
    const noteId = `note-${Date.now()}`;
    const noteRecord = {
      id: noteId,
      title: title,
      subject: subject,
      description: description || "",
      faculty: faculty || "Computing",
      year: year || "1st Year",
      batch: batch || "",
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      fileUrl: directDownloadUrl,
      fileType: noteStyle || "typed",
      noteType: validatedNoteType,
      fileDataUrl: "",
      driveDownloadUrl: directDownloadUrl,
      driveFileId: fileId,
      uploadedBy: uploaderEmail,
      uploaderName: uploaderName || "Unknown",
      date: new Date().toISOString().split("T")[0],
      downloads: 0,
      averageRating: 0.0,
      ratingsCount: 0,
      totalRating: 0,
      comments: [],
      rewards: [],
      contentMock: `
        <div class="pdf-note-mock" style="width: 100%; text-align: center; padding: 3rem 1.5rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(20, 184, 166, 0.05)); border: 2px dashed rgba(99, 102, 241, 0.2); border-radius: 16px; margin: 15px 0;">
          <div style="font-size: 4.5rem; margin-bottom: 1rem; filter: drop-shadow(0 4px 10px rgba(99, 102, 241, 0.25));">📄</div>
          <h4 style="font-family: Outfit, sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--text-color); margin: 0 0 0.5rem 0;">PDF Document Ready</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 320px; margin: 0 auto 1.5rem auto; line-height: 1.5;">
            "${title}" is uploaded to Google Drive as a high-quality PDF resource. Use the button below to download and view the full notes.
          </p>
        </div>
      `
    };

    // Save to Firebase Realtime Database
    const firebaseUrl = process.env.FIREBASE_DB_URL;
    const savedToFirebase = await saveNoteToFirebase(noteRecord, firebaseUrl);

    // Award uploader +15 UniCredits
    if (savedToFirebase) {
      await updateUserPointsInFirebase(uploaderEmail, 15, firebaseUrl);
    }

    // Clean up temp file
    deleteLocalTempFile(file.path);

    console.log(`[Upload] ✅ Complete! Note ID: ${noteId}\n`);

    return res.status(200).json({
      success: true,
      message: "File uploaded to Google Drive and note published successfully!",
      noteId: noteId,
      downloadUrl: directDownloadUrl,
      driveFileId: fileId,
      note: noteRecord
    });
  } catch (err) {
    console.error("[Upload] ❌ Error:", err.message);
    deleteLocalTempFile(file.path);

    return res.status(500).json({
      success: false,
      message: `Upload failed: ${err.message}`
    });
  }
}

module.exports = { handleUpload };
