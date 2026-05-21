@echo off
set "ROOT=%~dp0.."
cd /d "%ROOT%"
set "NPM_PATH=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_PATH%" set "NPM_PATH=npm.cmd"
set APP_MODE=chrome
"%NPM_PATH%" run dev
pause
