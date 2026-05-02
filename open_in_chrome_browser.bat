@echo off
set "CWD=%~dp0"
cd /d "%CWD%"

echo ==========================================
echo    Starting: Drug Price Compare - Web
echo ==========================================

echo 1. Starting Backend Service...
:: Using absolute path to npm to ensure it works even if not in PATH
set "NPM_PATH=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_PATH%" set "NPM_PATH=npm.cmd"

start "DrugPriceBackend" cmd /c ""%NPM_PATH%" run dev"

echo 2. Waiting for initialization (10s)...
timeout /t 10 /nobreak

echo 3. Launching Chrome Browser...
start chrome "http://127.0.0.1:3010"

echo.
echo If the backend window closed instantly, check if Node.js is installed.
echo Path used: %NPM_PATH%
echo.
pause
