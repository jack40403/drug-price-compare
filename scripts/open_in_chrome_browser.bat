@echo off
set "ROOT=%~dp0.."
cd /d "%ROOT%"
set "NPM_PATH=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_PATH%" set "NPM_PATH=npm.cmd"

echo Starting Backend Service...
start "DrugPriceBackend" cmd /c ""%NPM_PATH%" run dev"

echo Waiting for initialization (10s)...
timeout /t 10 /nobreak

echo Launching Chrome Browser...
start chrome "http://127.0.0.1:3010"
pause
