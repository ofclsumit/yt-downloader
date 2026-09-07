@echo off
setlocal enabledelayedexpansion
title YouTube Video Downloader - Local Host Mode

echo ======================================================================
echo    YouTube Video Downloader - Local Host Mode Startup
echo ======================================================================
echo.

:: 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (v18+) from https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Node.js detected: %NODE_VERSION%

:: 2. Verify Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python (3.10+) from https://python.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version') do set PY_VERSION=%%v
echo [OK] Python detected: %PY_VERSION%

:: 3. Verify FFmpeg
set FFMPEG_FOUND=0
where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    set FFMPEG_FOUND=1
    echo [OK] System FFmpeg detected in PATH
) else (
    if exist "node_modules\ffmpeg-static\ffmpeg.exe" (
        set FFMPEG_FOUND=1
        echo [OK] Local node_modules FFmpeg binary detected
    )
)

if %FFMPEG_FOUND% equ 0 (
    echo.
    echo [WARNING] FFmpeg was not found in PATH or node_modules!
    echo Video clipping requires FFmpeg. You can install it on Windows via:
    echo   winget install Gyan.FFmpeg
    echo or download from https://ffmpeg.org
    echo The app will start, but media processing may be limited until FFmpeg is installed.
    echo.
)

:: 4. Verify npm dependencies
if not exist "node_modules" (
    echo.
    echo [SETUP] Installing npm packages...
    call npm install
)

:: 5. Verify Python dependencies
python -c "import fastapi, uvicorn, yt_dlp" >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [SETUP] Installing required Python packages...
    call pip install -r requirements.txt
)

echo.
echo ======================================================================
echo   Local Services Initialized:
echo   - Backend API:  http://127.0.0.1:3001
echo   - Frontend App: http://localhost:5173
echo ======================================================================
echo.
echo Opening browser at http://localhost:5173 ...
start http://localhost:5173

:: 6. Launch both frontend and backend concurrently
npm start

pause
