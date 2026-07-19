/**
 * Upload Route
 * 
 * POST /api/upload
 * 
 * Accepts multipart/form-data with:
 * - pdfFile (file): PDF document (max 10MB)
 * - title, subject, description, faculty, year, batch, tags, noteStyle (text)
 * - uploaderEmail, uploaderName (text)
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const os = require("os");
const { handleUpload } = require("../controllers/uploadController");

const router = express.Router();

// Configure multer storage — saves to OS temp directory to support serverless environments (like Vercel)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter — only allow PDF files and reject dangerous extensions
const fileFilter = (req, file, cb) => {
  const originalName = file.originalname.toLowerCase();
  
  // List of dangerous extensions to explicitly block
  const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".js", ".vbs", ".scr", ".msi", ".com"];
  const hasDangerousExt = dangerousExtensions.some(ext => originalName.endsWith(ext));

  if (hasDangerousExt) {
    return cb(new Error("Upload rejected: Dangerous file extension detected."), false);
  }

  const allowedMimes = ["application/pdf"];
  const isPdf =
    allowedMimes.includes(file.mimetype) ||
    originalName.endsWith(".pdf");

  if (isPdf) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF files are allowed."), false);
  }
};

// Multer instance with 3MB limit
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3 MB max
  }
});

// POST /api/upload — Single file upload with field name 'pdfFile'
router.post("/", upload.single("pdfFile"), (req, res, next) => {
  handleUpload(req, res).catch(next);
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum allowed size is 3MB."
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next();
});

module.exports = router;
