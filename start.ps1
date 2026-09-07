# YouTube Video Downloader - Local Host Mode Startup (PowerShell)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   YouTube Video Downloader - Local Host Mode Startup" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not found in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}
$nodeVer = node -v
Write-Host "[OK] Node.js detected: $nodeVer" -ForegroundColor Green

# 2. Verify Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not found in PATH!" -ForegroundColor Red
    Write-Host "Please install Python (3.10+) from https://python.org" -ForegroundColor Yellow
    exit 1
}
$pyVer = python --version
Write-Host "[OK] Python detected: $pyVer" -ForegroundColor Green

# 3. Verify FFmpeg
$ffmpegFound = $false
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    $ffmpegFound = $true
    Write-Host "[OK] System FFmpeg detected in PATH" -ForegroundColor Green
} elseif (Test-Path "node_modules\ffmpeg-static\ffmpeg.exe") {
    $ffmpegFound = $true
    Write-Host "[OK] Local node_modules FFmpeg binary detected" -ForegroundColor Green
}

if (-not $ffmpegFound) {
    Write-Host ""
    Write-Host "[WARNING] FFmpeg was not found in PATH or node_modules!" -ForegroundColor Yellow
    Write-Host "Video clipping requires FFmpeg. You can install it on Windows via:" -ForegroundColor Yellow
    Write-Host "  winget install Gyan.FFmpeg" -ForegroundColor White
    Write-Host "or download from https://ffmpeg.org" -ForegroundColor White
    Write-Host "The app will start, but media processing may be limited until FFmpeg is installed." -ForegroundColor Yellow
    Write-Host ""
}

# 4. Verify npm packages
if (-not (Test-Path "node_modules")) {
    Write-Host "[SETUP] Installing npm packages..." -ForegroundColor Cyan
    npm install
}

# 5. Verify Python packages
python -c "import fastapi, uvicorn, yt_dlp" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[SETUP] Installing required Python packages..." -ForegroundColor Cyan
    pip install -r requirements.txt
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Local Services Initialized:" -ForegroundColor Cyan
Write-Host "  - Backend API:  http://127.0.0.1:3001" -ForegroundColor White
Write-Host "  - Frontend App: http://localhost:5173" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:5173"
npm start
