@echo off
echo ====================================
echo  UniBuddy Backend - Starting Server
echo ====================================
echo.

cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  npm install
  echo.
)

echo Starting server on port 5000...
node server.js

pause
