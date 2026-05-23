@echo off
set "ROOT=%~dp0.."
cd /d "%ROOT%"
set "PLAYWRIGHT_BROWSERS_PATH=%ROOT%\browsers"
npm run dev
