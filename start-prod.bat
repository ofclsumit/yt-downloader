@echo off
setlocal enabledelayedexpansion
title YouTube Video Downloader - Standalone Local Production Mode

echo ======================================================================
echo   YouTube Video Downloader - Standalone Local Production Mode
echo ======================================================================
echo.
echo [1/3] Building production frontend bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Starting standalone backend (serving built UI on 127.0.0.1:3001)...
echo Local URL: http://127.0.0.1:3001
echo.
echo Opening browser at http://127.0.0.1:3001 ...
start http://127.0.0.1:3001

echo [3/3] Running Python FastAPI host service...
python youtube.py

pause
